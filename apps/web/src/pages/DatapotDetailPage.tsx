import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import {
  POT_FIELD_TYPE_LABELS,
  slugifyFieldName,
  normalizePotFields,
  uniqueSlug,
  type DataPotDto,
  type PotField,
  type PotFieldType,
} from '@datapot/shared';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { DataGrid } from '../components/DataGrid';
import { IconPencil } from '../components/Icons';
import { notifyNavRefresh } from '../lib/datapots-nav';
import { useT } from '../i18n';

type FieldMode = 'create' | 'edit' | null;
type PropKey = 'name' | 'port';

const FIELD_TYPES: PotFieldType[] = ['number', 'text', 'url', 'date', 'boolean', 'type'];

function RequiredBadgeCell(p: ICellRendererParams<PotField>) {
  if (!p.data) return null;
  return p.data.required ? (
    <Badge tone="warning">필수</Badge>
  ) : (
    <Badge tone="neutral">선택</Badge>
  );
}

function NullableBadgeCell(p: ICellRendererParams<PotField>) {
  if (!p.data) return null;
  return p.data.nullable ? (
    <Badge tone="primary">허용</Badge>
  ) : (
    <Badge tone="neutral">불가</Badge>
  );
}

function TypeBadgeCell(p: ICellRendererParams<PotField>) {
  if (!p.data) return null;
  return <Badge tone="primary">{POT_FIELD_TYPE_LABELS[p.data.type]}</Badge>;
}

export function DatapotDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const [pot, setPot] = useState<DataPotDto | null>(null);
  const [fields, setFields] = useState<PotField[]>([]);
  const [mode, setMode] = useState<FieldMode>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState('');
  const [nameKo, setNameKo] = useState('');
  const [fieldType, setFieldType] = useState<PotFieldType>('text');
  const [required, setRequired] = useState(false);
  const [nullable, setNullable] = useState(false);
  const [fieldDescription, setFieldDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingProp, setEditingProp] = useState<PropKey | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPort, setDraftPort] = useState(9001);
  const [tokenDays, setTokenDays] = useState<30 | 90 | 365>(30);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiMenuOpen, setApiMenuOpen] = useState(false);
  const savingProp = useRef(false);
  const apiMenuRef = useRef<HTMLDivElement>(null);

  const liveSlug = useMemo(() => {
    const base = slugifyFieldName(nameEn);
    return uniqueSlug(
      base,
      fields.map((f) => f.slug),
      editingSlug ?? undefined,
    );
  }, [nameEn, fields, editingSlug]);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api<DataPotDto>(`/datapots/${id}`);
    setPot(data);
    setFields(data.fields ?? []);
  }, [id]);

  useEffect(() => {
    load().catch((e) => toast.push('error', e.message));
  }, [load, toast]);

  useEffect(() => {
    if (!apiMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!apiMenuRef.current?.contains(e.target as Node)) {
        setApiMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [apiMenuOpen]);

  function startEdit(key: PropKey) {
    if (!pot) return;
    setDraftName(pot.name);
    setDraftPort(pot.port);
    setEditingProp(key);
  }

  async function savePotPatch(
    patch: Partial<Pick<DataPotDto, 'name' | 'port' | 'enabled'>>,
  ) {
    if (!id || !pot) return;
    if (savingProp.current) return;
    savingProp.current = true;
    const deactivatedByEndpoint = patch.port != null && patch.port !== pot.port;
    try {
      const updated = await api<DataPotDto>(`/datapots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setPot(updated);
      setFields(updated.fields ?? []);
      notifyNavRefresh();
      toast.push(
        'success',
        deactivatedByEndpoint ? t('potDetail.deactivated') : t('potDetail.saved'),
      );
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('potDetail.saveFail'));
      await load();
    } finally {
      savingProp.current = false;
      setEditingProp(null);
    }
  }

  async function commitName() {
    const next = draftName.trim();
    setEditingProp(null);
    if (!pot || !next || next === pot.name) return;
    await savePotPatch({ name: next });
  }

  async function commitPort() {
    const next = Number(draftPort);
    setEditingProp(null);
    if (!pot || !Number.isFinite(next) || next < 1024 || next > 65535 || next === pot.port) {
      return;
    }
    await savePotPatch({ port: next });
  }

  async function runApiAction(action: 'restart' | 'enable' | 'disable') {
    if (!id || !pot) return;
    if (action === 'restart' && !pot.enabled) {
      toast.push('error', t('potDetail.restartBlocked'));
      setApiMenuOpen(false);
      return;
    }
    setApiMenuOpen(false);
    setApiBusy(true);
    try {
      if (action === 'restart') {
        const updated = await api<DataPotDto>(`/datapots/${id}/restart`, { method: 'POST' });
        setPot(updated);
        toast.push('success', t('potDetail.restartOk', { port: updated.port }));
      } else {
        const enabled = action === 'enable';
        if (pot.enabled === enabled) {
          toast.push('success', enabled ? t('potDetail.alreadyOn') : t('potDetail.alreadyOff'));
          return;
        }
        const updated = await api<DataPotDto>(`/datapots/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled }),
        });
        setPot(updated);
        setFields(updated.fields ?? []);
        notifyNavRefresh();
        toast.push('success', enabled ? t('potDetail.enabledOk') : t('potDetail.disabledOk'));
      }
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('potDetail.actionFail'));
    } finally {
      setApiBusy(false);
    }
  }

  function openCreate() {
    setEditingSlug(null);
    setNameEn('');
    setNameKo('');
    setFieldType('text');
    setRequired(false);
    setNullable(false);
    setFieldDescription('');
    setMode('create');
  }

  function openEdit(field: PotField) {
    setEditingSlug(field.slug);
    setNameEn(field.nameEn);
    setNameKo(field.nameKo);
    setFieldType(field.type);
    setRequired(field.required);
    setNullable(field.nullable === true);
    setFieldDescription(field.description ?? '');
    setMode('edit');
  }

  async function saveFields(next: PotField[]) {
    if (!id) return;
    setBusy(true);
    try {
      const updated = await api<DataPotDto>(`/datapots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: next }),
      });
      setPot(updated);
      setFields(updated.fields ?? []);
      notifyNavRefresh();
      setMode(null);
      toast.push('success', '필드가 저장되었습니다');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nameEn.trim()) {
      toast.push('error', '영문 필드명을 입력하세요');
      return;
    }
    const previous = editingSlug ? fields.find((field) => field.slug === editingSlug) : undefined;
    const nextField: PotField = {
      slug: liveSlug,
      nameEn: nameEn.trim(),
      nameKo: nameKo.trim(),
      type: fieldType,
      required,
      nullable,
      description: fieldDescription.trim() || undefined,
      trend: fieldType === 'type' && previous?.trend === true,
    };
    let next: PotField[];
    if (mode === 'create') {
      next = [...fields, nextField];
    } else if (mode === 'edit' && editingSlug) {
      next = fields.map((f) => (f.slug === editingSlug ? nextField : f));
    } else {
      return;
    }
    await saveFields(normalizePotFields(next));
  }

  async function removeField(slug: string) {
    if (!confirm('이 필드를 삭제할까요?')) return;
    await saveFields(fields.filter((f) => f.slug !== slug));
  }

  const cols = useMemo<ColDef<PotField>[]>(
    () => [
      {
        field: 'slug',
        headerName: 'slug',
        flex: 1,
        minWidth: 140,
        cellClass: 'dpot-mono-cell',
      },
      { field: 'nameEn', headerName: '필드명 (영문)', flex: 1, minWidth: 140 },
      { field: 'nameKo', headerName: '필드명 (국문)', flex: 1, minWidth: 120 },
      {
        field: 'type',
        headerName: '데이터 타입',
        width: 120,
        cellRenderer: TypeBadgeCell,
      },
      {
        field: 'required',
        headerName: '필수',
        width: 100,
        cellRenderer: RequiredBadgeCell,
      },
      {
        field: 'nullable',
        headerName: 'null',
        width: 100,
        cellRenderer: NullableBadgeCell,
      },
      {
        headerName: '',
        width: 160,
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<PotField>) =>
          p.data ? (
            <div className="dpot-cell-actions">
              <button className="dpot-btn" type="button" onClick={() => openEdit(p.data!)}>
                수정
              </button>
              <button
                className="dpot-btn danger"
                type="button"
                onClick={() => void removeField(p.data!.slug)}
              >
                삭제
              </button>
            </div>
          ) : null,
      },
    ],
    [fields],
  );

  return (
    <div className="fops-admin-page fops-admin-page--fill">
      <div className="dpot-page-head">
        <div className="dpot-page-head__title-row">
          <button
            type="button"
            className="dpot-btn"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/datapots');
            }}
          >
            ← {t('common.back')}
          </button>
          {editingProp === 'name' ? (
            <input
              className="dpot-page-title-input"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingProp(null);
              }}
            />
          ) : (
            <>
              <h1 className="dpot-page-title">{pot?.name ?? 'DATAPOT'}</h1>
              {pot ? (
                <button
                  type="button"
                  className="dpot-icon-btn"
                  aria-label={t('potDetail.editName')}
                  title={t('potDetail.editName')}
                  onClick={() => startEdit('name')}
                >
                  <IconPencil size={14} />
                </button>
              ) : null}
              {pot ? (
                pot.enabled ? (
                  <Badge tone="success">{t('common.active')}</Badge>
                ) : (
                  <Badge tone="neutral">{t('common.inactive')}</Badge>
                )
              ) : null}
            </>
          )}
        </div>
        <div className="dpot-actions">
          {pot ? (
            <div className="dpot-head-port">
              <span className="dpot-head-port__label">key</span>
              <code>{pot.key}</code>
            </div>
          ) : null}
          {pot ? (
            <div className="dpot-head-port">
              <span className="dpot-head-port__label">포트</span>
              {editingProp === 'port' ? (
                <input
                  className="dpot-head-port__input dpot-mono"
                  type="number"
                  min={1024}
                  max={65535}
                  value={draftPort}
                  autoFocus
                  onChange={(e) => setDraftPort(Number(e.target.value))}
                  onBlur={() => void commitPort()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingProp(null);
                  }}
                />
              ) : (
                <code>{pot.port}</code>
              )}
              {editingProp !== 'port' ? (
                <button
                  type="button"
                  className="dpot-icon-btn"
                  aria-label="포트 수정"
                  title="포트 수정"
                  onClick={() => startEdit('port')}
                >
                  <IconPencil size={14} />
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="dpot-dropdown" ref={apiMenuRef}>
            <button
              className="dpot-btn"
              type="button"
              disabled={!pot || apiBusy}
              aria-expanded={apiMenuOpen}
              onClick={() => setApiMenuOpen((o) => !o)}
            >
              {apiBusy ? t('potDetail.processing') : `${t('potDetail.apiControl')} ▾`}
            </button>
            {apiMenuOpen ? (
              <div className="dpot-dropdown__menu" role="menu">
                <button
                  type="button"
                  className="dpot-dropdown__item"
                  role="menuitem"
                  disabled={pot?.enabled !== true}
                  onClick={() => void runApiAction('restart')}
                >
                  {t('potDetail.restart')}
                </button>
                <button
                  type="button"
                  className="dpot-dropdown__item"
                  role="menuitem"
                  disabled={pot?.enabled === true}
                  onClick={() => void runApiAction('enable')}
                >
                  {t('potDetail.enable')}
                </button>
                <button
                  type="button"
                  className="dpot-dropdown__item"
                  role="menuitem"
                  disabled={pot?.enabled === false}
                  onClick={() => void runApiAction('disable')}
                >
                  {t('potDetail.disable')}
                </button>
              </div>
            ) : null}
          </div>

          {id ? (
            <Link className="dpot-btn" to={`/datapots/${id}/data`}>
              {t('potDetail.data')}
            </Link>
          ) : null}
          <button className="dpot-btn primary" type="button" onClick={openCreate}>
            {t('potDetail.addField')}
          </button>
        </div>
      </div>

      <DataGrid rowData={fields} columnDefs={cols} getRowId={(p) => p.data.slug} />

      {pot ? (
        <form
          className="dpot-form-grid"
          style={{ marginTop: 16, maxWidth: 520 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!id) return;
            setTokenBusy(true);
            setIssuedToken(null);
            void api<{ token: string; expiresAt: string }>(`/datapots/${id}/token`, {
              method: 'POST',
              body: JSON.stringify({ days: tokenDays }),
            })
              .then((result) => {
                setIssuedToken(result.token);
                setPot((current) =>
                  current ? { ...current, apiTokenExpiresAt: result.expiresAt } : current,
                );
                toast.push('success', '토큰을 발행했습니다. 이 화면을 닫으면 다시 볼 수 없습니다.');
              })
              .catch((err) => {
                toast.push('error', err instanceof Error ? err.message : '토큰 발행 실패');
              })
              .finally(() => setTokenBusy(false));
          }}
        >
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
            다시 발행하면 이전 토큰은 바로 무효가 됩니다.
          </p>
          <button className="dpot-btn" type="submit" disabled={tokenBusy}>
            {tokenBusy ? '발행 중…' : pot.apiTokenExpiresAt ? '토큰 재발행' : '토큰 발행'}
          </button>
          {issuedToken ? (
            <label>
              토큰 (한 번만 표시)
              <input className="dpot-mono" readOnly value={issuedToken} />
            </label>
          ) : null}
        </form>
      ) : null}

      <Modal
        open={mode !== null}
        title={mode === 'create' ? '필드 추가' : '필드 수정'}
        onClose={() => setMode(null)}
        width={480}
        footer={
          <>
            <button className="dpot-btn" type="button" onClick={() => setMode(null)}>
              취소
            </button>
            <button className="dpot-btn primary" type="submit" form="field-form" disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </>
        }
      >
        <form id="field-form" className="dpot-form-grid" onSubmit={(e) => void onSubmit(e)}>
          <label>
            slug (자동)
            <input className="dpot-mono" value={liveSlug} readOnly tabIndex={-1} />
          </label>
          <label>
            필드명 (영문)
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Product Name"
              required
              autoFocus
            />
          </label>
          <label>
            필드명 (국문)
            <input
              value={nameKo}
              onChange={(e) => setNameKo(e.target.value)}
              placeholder="예: 상품명"
            />
          </label>
          <label>
            설명
            <input
              value={fieldDescription}
              onChange={(e) => setFieldDescription(e.target.value)}
              placeholder="MCP와 OpenAPI에 보이는 설명"
            />
          </label>
          <label>
            데이터 타입
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as PotFieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {POT_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="dpot-check-pair">
            <label className="dpot-check-row">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              필수 여부
            </label>
            <label className="dpot-check-row">
              <input
                type="checkbox"
                checked={nullable}
                onChange={(e) => setNullable(e.target.checked)}
              />
              null 허용
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
