import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from '@datapot/shared';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import {
  AuthPasswordField,
  AuthSplitLayout,
  AuthSubmitButton,
  AuthTextField,
} from '../components/AuthSplitLayout';

const REMEMBER_KEY = 'dpot_remember_user';

export function LoginPage() {
  const t = useT();
  const { login, loginBootstrap, refreshStatus, status } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const dbConnected = Boolean(status?.initialized);
  const [username, setUsername] = useState(
    () => localStorage.getItem(REMEMBER_KEY) || DEFAULT_ADMIN_USERNAME,
  );
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!status || seeded.current) return;
    seeded.current = true;
    if (status.initialized) {
      setPassword('');
    } else {
      setUsername(DEFAULT_ADMIN_USERNAME);
      setPassword(DEFAULT_ADMIN_PASSWORD);
    }
  }, [status]);

  async function onRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const s = await refreshStatus();
      if (s.initialized) {
        toast.push('success', t('login.toastDbOk'));
        setPassword('');
      } else {
        setUsername(DEFAULT_ADMIN_USERNAME);
        setPassword(DEFAULT_ADMIN_PASSWORD);
        toast.push('info', t('login.toastDbPending'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.toastFail');
      setError(msg);
      toast.push('error', msg);
    } finally {
      setRefreshing(false);
    }
  }

  async function onBootstrapLogin() {
    setBusy(true);
    setError(null);
    try {
      await loginBootstrap();
      toast.push('success', t('login.toastBootstrap'));
      navigate('/settings');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.toastFail');
      setError(msg);
      toast.push('error', msg);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dbConnected) return;
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      toast.push('success', t('login.toastOk'));
      navigate('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.toastFail');
      setError(msg);
      toast.push('error', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSplitLayout>
      <div className="af-head">
        <h1 className="af-title">{t('login.title')}</h1>
        <p className="af-sub">
          {dbConnected ? t('login.subConnected') : t('login.subDisconnected')}
        </p>
      </div>

      {error ? (
        <div className="af-error show" style={{ marginBottom: 16 }} role="alert">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <AuthTextField
          id="login-username"
          value={username}
          onChange={setUsername}
          disabled={!dbConnected}
          label={t('login.username')}
        />
        <AuthPasswordField
          id="login-password"
          value={password}
          onChange={setPassword}
          disabled={!dbConnected}
          label={t('login.password')}
          showLabel={t('login.showPassword')}
          hideLabel={t('login.hidePassword')}
        />

        {dbConnected ? (
          <AuthSubmitButton busy={busy} disabled={!username.trim() || !password.trim()}>
            {busy ? t('login.submitting') : t('login.submit')}
          </AuthSubmitButton>
        ) : (
          <div className="af-btn-row">
            <button
              type="button"
              className="btn-submit btn-submit--ghost"
              disabled={busy || refreshing}
              onClick={() => void onRefresh()}
            >
              {refreshing ? t('login.refreshing') : t('login.refresh')}
            </button>
            <button
              type="button"
              className="btn-submit"
              disabled={busy || refreshing}
              onClick={() => void onBootstrapLogin()}
            >
              {busy ? t('login.submitting') : t('login.bootstrap')}
            </button>
          </div>
        )}

        <label className="af-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {t('login.remember')}
        </label>
      </form>
    </AuthSplitLayout>
  );
}
