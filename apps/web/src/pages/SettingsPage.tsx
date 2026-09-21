import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DB_CONNECTION_EXAMPLES,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  isValidExternalHost,
  isValidPortNumber,
  type DbType,
} from '@datapot/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { LOCALES, useLocale, useT, type Locale } from '../i18n';

interface DbInfo {
  configured: boolean;
  connected?: boolean;
  type?: DbType;
  url?: string;
  passwordHint?: string;
  adminUsername?: string;
  emptyDatabase?: boolean;
  message?: string;
  defaultAdminPassword?: string;
}

interface ExternalInfo {
  configured: boolean;
  host: string;
  port: number | null;
  message?: string;
}

type ConnState = 'idle' | 'ok' | 'fail';

type ReloginModal = {
  emptyDatabase: boolean;
};

const RELOGIN_SECONDS = 3;

export function SettingsPage() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshStatus, logout } = useAuth();
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [dbType, setDbType] = useState<DbType>('mariadb');
  const [url, setUrl] = useState(DB_CONNECTION_EXAMPLES.mariadb);
  const [savedDbType, setSavedDbType] = useState<DbType>('mariadb');
  const [savedUrl, setSavedUrl] = useState(DB_CONNECTION_EXAMPLES.mariadb);
  const [busy, setBusy] = useState(false);
  const [connState, setConnState] = useState<ConnState>('idle');
  const [connMessage, setConnMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [emptyDb, setEmptyDb] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPassword2, setAdminPassword2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [relogin, setRelogin] = useState<ReloginModal | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(RELOGIN_SECONDS);
  const logoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [extHost, setExtHost] = useState('');
  const [extPort, setExtPort] = useState('');
  const [savedExtHost, setSavedExtHost] = useState('');
  const [savedExtPort, setSavedExtPort] = useState('');
  const [extBusy, setExtBusy] = useState(false);
  const [extConfigured, setExtConfigured] = useState(false);
  const [extHostError, setExtHostError] = useState<string | null>(null);
  const [extPortError, setExtPortError] = useState<string | null>(null);

  const example = useMemo(() => DB_CONNECTION_EXAMPLES[dbType], [dbType]);
  const urlLabel = dbType === 'sqlite' ? t('settings.dbms.filePath') : t('settings.dbms.url');
  const finishReloginRef = useRef<() => void>(() => {});

  const dbDirty = dbType !== savedDbType || url.trim() !== savedUrl.trim();
  const extDirty =
    extHost.trim() !== savedExtHost.trim() || extPort.trim() !== savedExtPort.trim();
  const pwDirty = adminPassword.length > 0 || adminPassword2.length > 0;

  async function load() {
    const d = await api<DbInfo>('/system/db');
    setInfo(d);
    let nextType: DbType = d.type ?? 'mariadb';
    let nextUrl = DB_CONNECTION_EXAMPLES[nextType];
    if (d.type) {
      nextType = d.type;
      if (d.url && (d.type === 'sqlite' || !d.url.includes('****'))) {
        nextUrl = d.url;
      } else {
        nextUrl = DB_CONNECTION_EXAMPLES[d.type];
      }
    }
    setDbType(nextType);
    setUrl(nextUrl);
    setSavedDbType(nextType);
    setSavedUrl(nextUrl);
    if (d.connected) setConnState('ok');
  }

  async function loadExternal() {
    const e = await api<ExternalInfo>('/system/external');
    setExtConfigured(e.configured);
    const host = e.host || '';
    const port = e.port != null ? String(e.port) : '';
    setExtHost(host);
    setExtPort(port);
    setSavedExtHost(host);
    setSavedExtPort(port);
  }

  useEffect(() => {
    load().catch((e) => toast.push('error', e.message));
    loadExternal().catch((e) => toast.push('error', e.message));
  }, []);

  useEffect(() => {
    return () => {
      if (logoutTimer.current) clearInterval(logoutTimer.current);
    };
  }, []);

  function finishRelogin() {
    if (logoutTimer.current) {
      clearInterval(logoutTimer.current);
      logoutTimer.current = null;
    }
    setRelogin(null);
    logout();
    navigate('/login', { replace: true });
  }

  finishReloginRef.current = finishRelogin;

  function startReloginFlow(emptyDatabase: boolean) {
    setRelogin({ emptyDatabase });
    setCountdown(RELOGIN_SECONDS);
    if (logoutTimer.current) clearInterval(logoutTimer.current);
    let left = RELOGIN_SECONDS;
    logoutTimer.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        if (logoutTimer.current) {
          clearInterval(logoutTimer.current);
          logoutTimer.current = null;
        }
        finishReloginRef.current();
      }
    }, 1000);
  }

  function onDbTypeChange(next: DbType) {
    setDbType(next);
    setUrl(DB_CONNECTION_EXAMPLES[next]);
    setConnState('idle');
    setConnMessage('');
    setFeedback(null);
    setEmptyDb(false);
  }

  function onLanguageChange(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    toast.push(
      'success',
      next === 'ko' ? '언어가 변경되었습니다' : 'Language updated',
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || relogin || !dbDirty) return;
    setConfirmOpen(true);
  }

  async function confirmAndSave() {
    setConfirmOpen(false);
    setBusy(true);
    setConnState('idle');
    setFeedback(null);
    try {
      const next = await api<DbInfo>('/system/db', {
        method: 'POST',
        body: JSON.stringify({ dbType, url }),
      });
      setInfo(next);
      setConnState('ok');
      setConnMessage('');
      setSavedDbType(dbType);
      setSavedUrl(url);
      setEmptyDb(Boolean(next.emptyDatabase));
      setFeedback(next.message || null);
      await refreshStatus();
      startReloginFlow(Boolean(next.emptyDatabase));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('settings.dbms.saveFail');
      setConnState('fail');
      setConnMessage(msg);
      setFeedback(null);
      setEmptyDb(false);
      toast.push('error', msg);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveExternal(e: FormEvent) {
    e.preventDefault();
    if (!extDirty) return;
    const host = extHost.trim();
    const portRaw = extPort.trim();
    let hostErr: string | null = null;
    let portErr: string | null = null;

    if (!host) {
      hostErr = t('settings.external.hostRequired');
    } else if (!isValidExternalHost(host)) {
      hostErr = t('settings.external.hostInvalid');
    }

    const portNum = portRaw ? Number(portRaw) : NaN;
    if (!portRaw) {
      portErr = t('settings.external.portRequired');
    } else if (!Number.isFinite(portNum) || !isValidPortNumber(portNum)) {
      portErr = t('settings.external.portInvalid');
    }

    setExtHostError(hostErr);
    setExtPortError(portErr);
    if (hostErr || portErr) {
      toast.push('error', hostErr || portErr || t('settings.external.inputInvalid'));
      return;
    }

    setExtBusy(true);
    try {
      const next = await api<ExternalInfo>('/system/external', {
        method: 'POST',
        body: JSON.stringify({ host, port: portNum }),
      });
      setExtConfigured(true);
      const savedHost = next.host;
      const savedPort = next.port != null ? String(next.port) : String(portNum);
      setExtHost(savedHost);
      setExtPort(savedPort);
      setSavedExtHost(savedHost);
      setSavedExtPort(savedPort);
      setExtHostError(null);
      setExtPortError(null);
      await refreshStatus();
      toast.push('success', next.message || t('settings.external.saved'));
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('settings.external.saveFail'));
    } finally {
      setExtBusy(false);
    }
  }

  async function onClearExternal() {
    setExtBusy(true);
    try {
      await api<ExternalInfo>('/system/external/clear', {
        method: 'POST',
        body: '{}',
      });
      setExtConfigured(false);
      setExtHost('');
      setExtPort('');
      setSavedExtHost('');
      setSavedExtPort('');
      setExtHostError(null);
      setExtPortError(null);
      await refreshStatus();
      toast.push('success', t('settings.external.cleared'));
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('settings.external.clearFail'));
    } finally {
      setExtBusy(false);
    }
  }

  async function onSetPassword(e: FormEvent) {
    e.preventDefault();
    if (!pwDirty) return;
    if (adminPassword.length < 4) {
      toast.push('error', t('settings.adminPw.tooShort'));
      return;
    }
    if (adminPassword !== adminPassword2) {
      toast.push('error', t('settings.adminPw.mismatch'));
      return;
    }
    setPwBusy(true);
    try {
      await api('/system/admin-password', {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword }),
      });
      setAdminPassword('');
      setAdminPassword2('');
      toast.push('success', t('settings.adminPw.changed'));
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('settings.adminPw.fail'));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="fops-admin-page">
      <div className="dpot-page-head">
        <div>
          <h1 className="dpot-page-title">{t('settings.title')}</h1>
        </div>
      </div>

      <div className="dpot-settings-stack">
        <div className="dpot-card">
          <div className="fops-admin-section-label">{t('settings.language.title')}</div>
          <p className="dpot-form-hint" style={{ marginTop: 0 }}>
            {t('settings.language.hint')}
          </p>
          <div className="dpot-form-grid">
            <label>
              {t('settings.language.label')}
              <select
                value={locale}
                onChange={(e) => onLanguageChange(e.target.value as Locale)}
                disabled={Boolean(relogin)}
              >
                {LOCALES.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.nativeLabel} ({opt.label})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="dpot-card">
          <div className="fops-admin-section-label">{t('settings.dbms.title')}</div>

          <div className="dpot-settings-status">
            <span>{t('settings.dbms.status')}</span>
            {info?.connected || connState === 'ok' ? (
              <Badge tone="success">{t('settings.dbms.connected')}</Badge>
            ) : info?.configured ? (
              <Badge tone="warning">{t('settings.dbms.configuredUnknown')}</Badge>
            ) : (
              <Badge tone="neutral">{t('settings.dbms.notConfigured')}</Badge>
            )}
            {info?.type ? (
              <span className="dpot-settings-status__meta">
                {info.type}
                {info.url ? ` — ${info.url}` : ''}
              </span>
            ) : null}
          </div>

          <form className="dpot-form-grid" onSubmit={(e) => void onSubmit(e)}>
            <label>
              {t('settings.dbms.type')}
              <select
                value={dbType}
                onChange={(e) => onDbTypeChange(e.target.value as DbType)}
                disabled={Boolean(relogin)}
              >
                <option value="mariadb">MariaDB</option>
                <option value="mongodb">MongoDB</option>
                <option value="sqlite">SQLite</option>
              </select>
            </label>
            <label>
              {urlLabel}
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (connState === 'fail') {
                    setConnState('idle');
                    setConnMessage('');
                  }
                }}
                required
                disabled={Boolean(relogin)}
              />
            </label>
            <p className="dpot-form-hint">{t('settings.dbms.example', { example })}</p>

            {connState === 'fail' ? (
              <div className="dpot-conn-status dpot-conn-status--fail" role="status">
                {t('settings.dbms.connectFail')}
                {connMessage ? ` — ${connMessage}` : ''}
              </div>
            ) : null}

            {feedback && !relogin ? (
              <div
                className={`dpot-conn-status ${emptyDb ? 'dpot-conn-status--ok' : 'dpot-conn-status--existing'}`}
                role="status"
              >
                {feedback}
                {emptyDb ? (
                  <>
                    {' '}
                    {t('settings.dbms.account')}: <code>{DEFAULT_ADMIN_USERNAME}</code> /{' '}
                    <code>{DEFAULT_ADMIN_PASSWORD}</code>
                  </>
                ) : null}
              </div>
            ) : null}

            <button
              className="dpot-btn primary"
              type="submit"
              disabled={busy || Boolean(relogin) || !dbDirty}
            >
              {busy ? t('settings.dbms.saving') : t('settings.dbms.save')}
            </button>
          </form>
        </div>

        <div className="dpot-card">
          <div className="fops-admin-section-label">{t('settings.external.title')}</div>
          <div className="dpot-settings-status">
            <span>{t('settings.external.status')}</span>
            {extConfigured ? (
              <Badge tone="success">{t('settings.external.configured')}</Badge>
            ) : (
              <Badge tone="neutral">{t('settings.external.notConfigured')}</Badge>
            )}
            {extConfigured && savedExtHost ? (
              <span className="dpot-settings-status__meta">
                {savedExtHost}
                {savedExtPort ? `:${savedExtPort}` : ''}
              </span>
            ) : null}
          </div>
          <p className="dpot-form-hint" style={{ marginTop: 0 }}>
            {t('settings.external.hint')}
          </p>
          <form className="dpot-form-grid" onSubmit={(e) => void onSaveExternal(e)} noValidate>
            <label>
              {t('settings.external.host')}
              <input
                value={extHost}
                onChange={(e) => {
                  setExtHost(e.target.value);
                  if (extHostError) setExtHostError(null);
                }}
                placeholder={t('settings.external.hostPlaceholder')}
                aria-invalid={Boolean(extHostError)}
                disabled={Boolean(relogin)}
              />
            </label>
            {extHostError ? (
              <p className="dpot-form-hint" style={{ color: 'var(--danger, #c62828)', marginTop: -8 }}>
                {extHostError}
              </p>
            ) : null}
            <label>
              {t('settings.external.port')}
              <input
                type="number"
                value={extPort}
                onChange={(e) => {
                  setExtPort(e.target.value);
                  if (extPortError) setExtPortError(null);
                }}
                placeholder={t('settings.external.portPlaceholder')}
                min={1}
                max={65535}
                aria-invalid={Boolean(extPortError)}
                disabled={Boolean(relogin)}
              />
            </label>
            {extPortError ? (
              <p className="dpot-form-hint" style={{ color: 'var(--danger, #c62828)', marginTop: -8 }}>
                {extPortError}
              </p>
            ) : null}
            <div className="dpot-form-actions">
              <button
                className="dpot-btn primary"
                type="submit"
                disabled={extBusy || Boolean(relogin) || !extDirty}
              >
                {extBusy ? t('common.saving') : t('settings.external.save')}
              </button>
              {extConfigured ? (
                <button
                  className="dpot-btn"
                  type="button"
                  disabled={extBusy || Boolean(relogin)}
                  onClick={() => void onClearExternal()}
                >
                  {t('settings.external.clear')}
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {emptyDb && feedback && !relogin ? (
          <div className="dpot-card">
            <div className="fops-admin-section-label">{t('settings.adminPw.title')}</div>
            <p className="dpot-form-hint" style={{ marginTop: 0 }}>
              {t('settings.adminPw.hint', { password: DEFAULT_ADMIN_PASSWORD })}
            </p>
            <form className="dpot-form-grid" onSubmit={(e) => void onSetPassword(e)}>
              <label>
                {t('settings.adminPw.newPassword')}
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={4}
                />
              </label>
              <label>
                {t('settings.adminPw.confirmPassword')}
                <input
                  type="password"
                  value={adminPassword2}
                  onChange={(e) => setAdminPassword2(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={4}
                />
              </label>
              <button className="dpot-btn primary" type="submit" disabled={pwBusy || !pwDirty}>
                {pwBusy ? t('common.saving') : t('settings.adminPw.submit')}
              </button>
            </form>
          </div>
        ) : null}
      </div>

      <Modal
        open={confirmOpen}
        title={t('settings.dbms.confirmTitle')}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="dpot-btn" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="dpot-btn primary" onClick={() => void confirmAndSave()}>
              {t('common.confirm')}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.55 }}>{t('settings.dbms.confirmBody')}</p>
      </Modal>

      <Modal
        open={Boolean(relogin)}
        title={t('settings.dbms.configuredTitle')}
        onClose={finishRelogin}
        footer={
          <button type="button" className="dpot-btn primary" onClick={finishRelogin}>
            {t('settings.dbms.loginNow')}
          </button>
        }
      >
        <p style={{ margin: '0 0 12px', lineHeight: 1.55 }}>
          {relogin?.emptyDatabase
            ? t('settings.dbms.emptyDbAccount', {
                user: DEFAULT_ADMIN_USERNAME,
                password: DEFAULT_ADMIN_PASSWORD,
              })
            : t('settings.dbms.existingDb')}
        </p>
        <p style={{ margin: 0, color: 'var(--slate-500)', fontSize: 13, lineHeight: 1.5 }}>
          {t('settings.dbms.reloginHint', { seconds: countdown })}
        </p>
      </Modal>
    </div>
  );
}
