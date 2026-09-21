import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import type { DataPotDto, DatapotBackupFile, ExternalConnection } from '@datapot/shared';
import { POT_OAS_PATHS, buildPotApiPaths, buildPotPublicBase, normalizePotKey } from '@datapot/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { DataGrid } from '../components/DataGrid';
import { IconCopy } from '../components/Icons';
import { notifyNavRefresh } from '../lib/datapots-nav';
import { useT } from '../i18n';

type Mode = 'create' | null;

function EnabledBadgeCell(p: ICellRendererParams<DataPotDto>) {
  if (!p.data) return null;
  return p.data.enabled ? (
    <Badge tone="success">활성</Badge>
  ) : (
    <Badge tone="neutral">비활성</Badge>
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
    const potKey = normalizePotKey(key || name);
    if (!potKey) {
      toast.push('error', 'key를 입력하세요');
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
      toast.push('success', 'POT이 생성되었습니다');
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
        width: 100,
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
                <IconCopy size={14} />
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

  const fullUrl = copyTarget ? potUrl(copyTarget) : '';

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
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              required
            />
          </label>
          <p className="dpot-form-hint">
            API 경로: <code>/api/{key.trim() || '{key}'}/data</code>
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

      <Modal
        open={copyTarget !== null}
        title={`API 복사 — ${copyTarget?.name ?? ''}`}
        onClose={() => setCopyTarget(null)}
        width={560}
        footer={
          <button className="dpot-btn" type="button" onClick={() => setCopyTarget(null)}>
            닫기
          </button>
        }
      >
        {copyTarget ? (
          <div className="dpot-copy-list">
            <CopyField label="전체 주소 (스키마 · 호스트 · 포트 · URL)" value={fullUrl} />
            <CopyField
              label="OpenAPI (JSON)"
              value={potUrl(copyTarget, POT_OAS_PATHS.openapi)}
            />
            <CopyField
              label="OpenAPI Docs (Swagger UI)"
              value={potUrl(copyTarget, POT_OAS_PATHS.docs)}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
