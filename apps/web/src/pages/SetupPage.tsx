import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  DB_CONNECTION_EXAMPLES,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  type SystemStatus,
} from '@datapot/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  AuthPasswordField,
  AuthSplitLayout,
  AuthSubmitButton,
} from '../components/AuthSplitLayout';

type ConnState = 'idle' | 'ok' | 'fail';

export function SetupPage() {
  const { status, refreshStatus } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [url, setUrl] = useState(DB_CONNECTION_EXAMPLES.mongodb);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnState>('idle');
  const [connMessage, setConnMessage] = useState('');
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPassword2, setAdminPassword2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const example = DB_CONNECTION_EXAMPLES.mongodb;

  if (status?.initialized && !showPasswordStep) {
    return <Navigate to="/login" replace />;
  }

  async function onConnect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setConnState('idle');
    try {
      await api<SystemStatus & { passwordHint?: string }>('/system/setup', {
        method: 'POST',
        body: JSON.stringify({ dbType: 'mongodb', url }),
      });
      setShowPasswordStep(true);
      setConnState('ok');
      setConnMessage('연결 성공');
      await refreshStatus();
      toast.push('success', 'DBMS 연결에 성공했습니다');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '연결 실패';
      setError(msg);
      setConnState('fail');
      setConnMessage(msg);
      toast.push('error', msg);
    } finally {
      setBusy(false);
    }
  }

  async function onSetPassword(e: FormEvent) {
    e.preventDefault();
    if (adminPassword.length < 4) {
      toast.push('error', '비밀번호는 4자 이상이어야 합니다');
      return;
    }
    if (adminPassword !== adminPassword2) {
      toast.push('error', '비밀번호가 일치하지 않습니다');
      return;
    }
    setPwBusy(true);
    try {
      await api('/system/setup/admin-password', {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword }),
      });
      toast.push('success', 'admin 비밀번호가 설정되었습니다');
      navigate('/login');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '비밀번호 설정 실패');
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <AuthSplitLayout>
      <div className="af-head">
        <h1 className="af-title">DBMS 설정</h1>
        <p className="af-sub">MongoDB 연결 URL을 입력합니다.</p>
      </div>

      {error ? (
        <div className="af-error show" style={{ marginBottom: 16 }} role="alert">
          {error}
        </div>
      ) : null}

      {!showPasswordStep ? (
        <form onSubmit={(e) => void onConnect(e)}>
          <div className="af-row">
            <label className="form-label" htmlFor="url">
              연결 URL
            </label>
            <input
              id="url"
              className="form-control"
              style={{ paddingLeft: 12 }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <p className="af-hint">
              예제: <code>{example}</code>
            </p>
          </div>

          {connState !== 'idle' ? (
            <div
              className={`dpot-conn-status dpot-conn-status--${connState}`}
              role="status"
            >
              {connState === 'ok' ? '연결됨' : '연결 실패'}
              {connMessage ? ` — ${connMessage}` : ''}
            </div>
          ) : null}

          <AuthSubmitButton busy={busy}>
            {busy ? '연결 확인 중…' : '저장 및 연결 확인'}
          </AuthSubmitButton>
        </form>
      ) : (
        <div>
          <div className="dpot-conn-status dpot-conn-status--ok" role="status">
            DBMS 연결에 성공했습니다. admin 비밀번호를 확인하거나 재설정하세요.
          </div>
          <p className="af-sub" style={{ marginTop: 12 }}>
            기본 계정: <code>{DEFAULT_ADMIN_USERNAME}</code> / 미설정 시{' '}
            <code>{DEFAULT_ADMIN_PASSWORD}</code>
          </p>
          <form onSubmit={(e) => void onSetPassword(e)} style={{ marginTop: 16 }}>
            <AuthPasswordField
              id="adminPassword"
              label="새 admin 비밀번호"
              value={adminPassword}
              onChange={setAdminPassword}
              autoComplete="new-password"
            />
            <AuthPasswordField
              id="adminPassword2"
              label="비밀번호 확인"
              value={adminPassword2}
              onChange={setAdminPassword2}
              autoComplete="new-password"
            />
            <AuthSubmitButton busy={pwBusy}>
              {pwBusy ? '저장 중…' : '비밀번호 저장 후 로그인'}
            </AuthSubmitButton>
            <button
              type="button"
              className="dpot-btn"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => navigate('/login')}
            >
              기본 비밀번호로 로그인
            </button>
          </form>
        </div>
      )}
    </AuthSplitLayout>
  );
}
