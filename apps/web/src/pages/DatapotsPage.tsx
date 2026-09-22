import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import type { DataPotDto, DatapotBackupFile, ExternalConnection } from '@datapot/shared';
import { POT_OAS_PATHS, buildPotApiPaths, buildPotPublicBase, isValidPotKey, normalizePotKey } from '@datapot/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { DataGrid } from '../components/DataGrid';
import { IconLink } from '../components/Icons';
import { PotStatusBadge } from '../components/PotStatusBadge';
import { notifyNavRefresh } from '../lib/datapots-nav';
import { useT } from '../i18n';

type Mode = 'create' | null;

function EnabledBadgeCell(p: ICellRendererParams<DataPotDto>) {
  if (!p.data) return null;
  return (
    <PotStatusBadge
      enabled={p.data.enabled}
      listening={p.data.listening}
      bindError={p.data.bindError}
    />
  );
}

function MethodBadgeCell() {
  return (
    <div className="dpot-badge-row">
      <Badge tone="primary">POST</Badge>
      <Badge tone="success">GET</Badge>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="dpot-icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function buildFullUrl(
  pot: Pick<DataPotDto, 'port' | 'key'>,
  path?: string,
  external?: ExternalConnection | null,
): string {
  const scheme = window.location.protocol.replace(':', '') || 'http';
  const host = window.location.hostname || 'localhost';
  const base = buildPotPublicBase({
    potPort: pot.port,
    external,
    fallbackHost: host,
    fallbackScheme: scheme,
  });
  const apiPath = path ?? buildPotApiPaths(pot.key).collection;
  return `${base}${apiPath}`;
}

function CopyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.push('success', '복사되었습니다');
    } catch {
      inputRef.current?.select();
      document.execCommand('copy');
      toast.push('success', '복사되었습니다');
    }
  }

  return (
    <div className="dpot-copy-field">
      <div className="dpot-copy-field__label">{label}</div>
      <div className="dpot-copy-field__row">
        <input
          ref={inputRef}
          className="dpot-copy-field__input"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
        />
        <button className="dpot-btn" type="button" onClick={() => void copy()}>
          복사
        </button>
      </div>
    </div>
  );
}

type CopyTab = 'api' | 'mcp' | 'auth';

function PotConnectModal({
  pot,
  external,
  onClose,
  onIssued,
}: {
  pot: DataPotDto;
  external: ExternalConnection | null;
  onClose: () => void;
  onIssued: (expiresAt: string) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<CopyTab>('api');
  const [tokenDays, setTokenDays] = useState<30 | 90 | 365>(30);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  function url(path?: string) {
    return buildFullUrl(pot, path, external);
  }

  async function issueToken(e: FormEvent) {
    e.preventDefault();
    setTokenBusy(true);
    setIssuedToken(null);
    try {
      const result = await api<{ token: string; expiresAt: string }>(`/datapots/${pot.id}/token`, {
        method: 'POST',
        body: JSON.stringify({ days: tokenDays }),
      });
      setIssuedToken(result.token);
      onIssued(result.expiresAt);
      toast.push('success', '토큰을 발행했습니다. 이 창을 닫으면 다시 볼 수 없습니다.');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '토큰 발행 실패');
    } finally {
      setTokenBusy(false);
    }
  }

  return (
    <Modal
      open
      title={`연결 — ${pot.name}`}
      onClose={onClose}
      width={640}
      footer={
        <button className="dpot-btn" type="button" onClick={onClose}>
          닫기
        </button>
      }
    >
      <div className="dpot-modal-tabs" role="tablist">
        {(
          [
            ['api', 'API'],
            ['mcp', 'MCP'],
            ['auth', 'Authentication'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="dpot-modal-tabs__btn"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'api' ? (
        <div className="dpot-copy-list" role="tabpanel">
          <CopyField label="전체 주소 (스키마 · 호스트 · 포트 · URL)" value={url()} />
          <CopyField label="OpenAPI (JSON)" value={url(POT_OAS_PATHS.openapi)} />
          <CopyField label="OpenAPI Docs (Swagger UI)" value={url(POT_OAS_PATHS.docs)} />
        </div>
      ) : null}
      {tab === 'mcp' ? (
        <div className="dpot-copy-list" role="tabpanel">
          <CopyField label="MCP (Streamable HTTP)" value={url('/mcp')} />
          <p className="dpot-form-hint">
            Authentication 탭에서 발행한 Bearer를 Authorization 헤더에 넣습니다.
          </p>
        </div>
      ) : null}
      {tab === 'auth' ? (
        <form className="dpot-form-grid dpot-connect-form" role="tabpanel" onSubmit={(e) => void issueToken(e)}>
          <label>
            API Bearer 만료
            <select
              value={tokenDays}
              onChange={(e) => setTokenDays(Number(e.target.value) as 30 | 90 | 365)}
            >
              <option value={30}>30일</option>
              <option value={90}>90일</option>
              <option value={365}>365일</option>
            </select>
          </label>
          <p className="dpot-form-hint">
            {pot.apiTokenExpiresAt
              ? `현재 토큰 만료: ${new Date(pot.apiTokenExpiresAt).toLocaleString()}`
              : '발행된 토큰이 없습니다.'}{' '}
            다시 발행하면 이전 토큰은 바로 무효가 됩니다. API와 MCP가 같은 토큰을 씁니다.
          </p>
          <button className="dpot-btn primary" type="submit" disabled={tokenBusy}>
            {tokenBusy ? '발행 중…' : pot.apiTokenExpiresAt ? '토큰 재발행' : '토큰 발행'}
          </button>
          {issuedToken ? <CopyField label="토큰 (한 번만 표시)" value={issuedToken} /> : null}
        </form>
      ) : null}
    </Modal>
  );
}

export function DatapotsPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { status } = useAuth();
  const external: ExternalConnection | null =
    status?.externalHost
      ? { host: status.externalHost, port: status.externalPort }
      : null;

  const [rows, setRows] = useState<DataPotDto[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [copyTarget, setCopyTarget] = useState<DataPotDto | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [port, setPort] = useState(9001);
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [xferBusy, setXferBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function potUrl(pot: Pick<DataPotDto, 'port' | 'key'>, path?: string) {
    return buildFullUrl(pot, path, external);
  }

  function openOasDocs(pot: DataPotDto) {
    if (!pot.enabled) {
      toast.push('error', '비활성 POT은 OpenAPI를 열 수 없습니다');
      return;
    }
    window.open(potUrl(pot, POT_OAS_PATHS.docs), '_blank', 'noopener,noreferrer');
  }

  const load = useCallback(async () => {
    const data = await api<DataPotDto[]>('/datapots');
    setRows(data);
    notifyNavRefresh();
  }, []);

  useEffect(() => {
    load().catch((e) => toast.push('error', e.message));
  }, [load, toast]);

  async function onBackup() {
    setXferBusy(true);
    try {
      const data = await api<DatapotBackupFile>('/datapots/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `datapot-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push('success', `백업 완료 (${data.pots.length}개 POT)`);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '백업 실패');
    } finally {
      setXferBusy(false);
    }
  }

  async function onRestoreFile(file: File) {
    setXferBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DatapotBackupFile;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.pots)) {
        throw new Error('올바른 백업 파일이 아닙니다 (version: 1, pots)');
      }
      const result = await api<{
        created: number;
        updated: number;
      }>('/datapots/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      await load();
      toast.push(
        'success',
        `복원 완료 — 생성 ${result.created} / 갱신 ${result.updated} (이름 기준)`,
      );
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '복원 실패');
    } finally {
      setXferBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function openCreate() {
    setName('');
    setKey('');
    setDescription('');
    setPort(9001 + rows.length);
    setEnabled(true);
    setMode('create');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const potKey = normalizePotKey(key);
    if (!isValidPotKey(potKey)) {
      toast.push('error', 'key는 소문자로 시작하고, 소문자·숫자·밑줄만 32자 이하로 써야 합니다');
      return;
    }
    setBusy(true);
    try {
      const created = await api<DataPotDto>('/datapots', {
        method: 'POST',
        body: JSON.stringify({
          name,
          key: potKey,
          port,
          description,
          enabled,
          fields: [],
        }),
      });
      if (created.enabled && !created.listening) {
        toast.push('error', created.bindError || '포트에 바인딩하지 못했습니다');
      } else {
        toast.push('success', 'POT이 생성되었습니다');
      }
      setMode(null);
      await load();
      navigate(`/datapots/${created.id}`);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  }

  const cols = useMemo<ColDef<DataPotDto>[]>(
    () => [
      {
        field: 'name',
        headerName: '이름',
        flex: 1,
        minWidth: 120,
      },
      {
        field: 'key',
        headerName: 'key',
        width: 120,
      },
      { field: 'port', headerName: '포트', width: 90 },
      {
        field: 'enabled',
        headerName: '활성',
        width: 120,
        cellRenderer: EnabledBadgeCell,
      },
      {
        headerName: 'METHOD',
        width: 140,
        cellRenderer: MethodBadgeCell,
        sortable: false,
        filter: false,
      },
      {
        headerName: 'URL',
        flex: 1,
        minWidth: 180,
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<DataPotDto>) =>
          p.data ? (
            <div className="dpot-url-cell">
              <IconBtn label="API 주소 복사" onClick={() => setCopyTarget(p.data!)}>
                <IconLink size={14} />
              </IconBtn>
              <span className="dpot-url-cell__path">
                {buildPotApiPaths(p.data.key).collection}
              </span>
            </div>
          ) : null,
      },
      {
        headerName: '',
        width: 240,
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<DataPotDto>) =>
          p.data ? (
            <div className="dpot-cell-actions">
              <Link className="dpot-btn" to={`/datapots/${p.data.id}`}>
                상세
              </Link>
              <button
                className="dpot-btn"
                type="button"
                onClick={() => openOasDocs(p.data!)}
              >
                OAS
              </button>
              <button
                className="dpot-btn danger"
                type="button"
                onClick={async () => {
                  if (!confirm(`삭제할까요? ${p.data!.name}`)) return;
                  try {
                    await api(`/datapots/${p.data!.id}`, { method: 'DELETE' });
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
    [load, toast, external],
  );

  return (
    <div className="fops-admin-page fops-admin-page--fill">
      <div className="dpot-page-head">
        <div>
          <h1 className="dpot-page-title">{t('datapots.title')}</h1>
        </div>
        <div className="dpot-actions">
          <button
            className="dpot-btn"
            type="button"
            disabled={xferBusy}
            onClick={() => void onBackup()}
          >
            {xferBusy ? '처리 중…' : '백업'}
          </button>
          <button
            className="dpot-btn"
            type="button"
            disabled={xferBusy}
            onClick={() => fileRef.current?.click()}
          >
            복원
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onRestoreFile(f);
            }}
          />
          <button className="dpot-btn primary" type="button" onClick={openCreate}>
            {t('datapots.add')}
          </button>
        </div>
      </div>

      <DataGrid rowData={rows} columnDefs={cols} />

      <Modal
        open={mode !== null}
        title="POT 추가"
        onClose={() => setMode(null)}
        width={480}
        footer={
          <>
            <button className="dpot-btn" type="button" onClick={() => setMode(null)}>
              취소
            </button>
            <button className="dpot-btn primary" type="submit" form="pot-form" disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </>
        }
      >
        <form id="pot-form" className="dpot-form-grid" onSubmit={onSubmit}>
          <label>
            이름
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            key
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="예: orders"
              pattern="[a-z][a-z0-9_]{0,31}"
              maxLength={32}
              required
            />
          </label>
          <p className="dpot-form-hint">
            소문자로 시작, 소문자·숫자·밑줄, 32자 이하. API 경로:{' '}
            <code>/api/{key.trim() || '{key}'}/data</code>
          </p>
          <label>
            포트
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              min={1024}
              max={65535}
              required
            />
          </label>
          <label>
            설명
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="dpot-check-row">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            활성 (포트 바인딩)
          </label>
        </form>
      </Modal>

      {copyTarget ? (
        <PotConnectModal
          key={copyTarget.id}
          pot={copyTarget}
          external={external}
          onClose={() => setCopyTarget(null)}
          onIssued={(expiresAt) => {
            setRows((current) =>
              current.map((row) =>
                row.id === copyTarget.id ? { ...row, apiTokenExpiresAt: expiresAt } : row,
              ),
            );
            setCopyTarget((current) =>
              current && current.id === copyTarget.id
                ? { ...current, apiTokenExpiresAt: expiresAt }
                : current,
            );
          }}
        />
      ) : null}
    </div>
  );
}
