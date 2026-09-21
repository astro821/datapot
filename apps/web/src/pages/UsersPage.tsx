import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import type { UserDto } from '@datapot/shared';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge, roleLabel } from '../components/Badge';
import { DataGrid } from '../components/DataGrid';
import { useT } from '../i18n';

type Mode = 'create' | 'edit' | null;

function RoleBadgeCell(p: ICellRendererParams<UserDto>) {
  if (!p.data) return null;
  const role = p.data.role;
  return <Badge tone={role === 'admin' ? 'primary' : 'neutral'}>{roleLabel(role)}</Badge>;
}

export function UsersPage() {
  const t = useT();
  const toast = useToast();
  const [rows, setRows] = useState<UserDto[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(await api<UserDto[]>('/users'));
  }, []);

  useEffect(() => {
    load().catch((e) => toast.push('error', e.message));
  }, [load, toast]);

  function openCreate() {
    setEditing(null);
    setUsername('');
    setPassword('');
    setRole('user');
    setMode('create');
  }

  function openEdit(user: UserDto) {
    setEditing(user);
    setUsername(user.username);
    setPassword('');
    setRole(user.role);
    setMode('edit');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'create') {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({ username, password, role }),
        });
        toast.push('success', '사용자가 추가되었습니다');
      } else if (mode === 'edit' && editing) {
        const body: Record<string, string> = { username, role };
        if (password.trim()) body.password = password;
        await api(`/users/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toast.push('success', '사용자가 수정되었습니다');
      }
      setMode(null);
      await load();
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  }

  const cols = useMemo<ColDef<UserDto>[]>(
    () => [
      { field: 'username', headerName: '사용자명', flex: 1 },
      {
        field: 'role',
        headerName: '역할',
        width: 120,
        cellRenderer: RoleBadgeCell,
      },
      { field: 'createdAt', headerName: '생성일', flex: 1 },
      {
        headerName: '',
        width: 160,
        cellRenderer: (p: { data?: UserDto }) =>
          p.data ? (
            <div className="dpot-cell-actions">
              <button className="dpot-btn" type="button" onClick={() => openEdit(p.data!)}>
                수정
              </button>
              <button
                className="dpot-btn danger"
                type="button"
                onClick={async () => {
                  if (!confirm(`삭제할까요? ${p.data!.username}`)) return;
                  try {
                    await api(`/users/${p.data!.id}`, { method: 'DELETE' });
                    toast.push('success', '삭제됨');
                    await load();
                  } catch (e) {
                    toast.push('error', e instanceof Error ? e.message : '삭제 실패');
                  }
                }}
              >
                삭제
              </button>
            </div>
          ) : null,
      },
    ],
    [load, toast],
  );

  return (
    <div className="fops-admin-page fops-admin-page--fill">
      <div className="dpot-page-head">
        <div>
          <h1 className="dpot-page-title">{t('users.title')}</h1>
        </div>
        <button className="dpot-btn primary" type="button" onClick={openCreate}>
          계정 추가
        </button>
      </div>

      <DataGrid rowData={rows} columnDefs={cols} />

      <Modal
        open={mode !== null}
        title={mode === 'create' ? '계정 추가' : '계정 수정'}
        onClose={() => setMode(null)}
        footer={
          <>
            <button className="dpot-btn" type="button" onClick={() => setMode(null)}>
              취소
            </button>
            <button className="dpot-btn primary" type="submit" form="user-form" disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </>
        }
      >
        <form id="user-form" className="dpot-form-grid" onSubmit={onSubmit}>
          <label>
            사용자명
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            비밀번호{mode === 'edit' ? ' (변경 시에만 입력)' : ''}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === 'create'}
              minLength={mode === 'create' ? 4 : undefined}
            />
          </label>
          <label>
            역할
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              <option value="user">사용자</option>
              <option value="admin">관리자</option>
            </select>
          </label>
        </form>
      </Modal>
    </div>
  );
}
