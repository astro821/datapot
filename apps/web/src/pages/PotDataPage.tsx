import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  IDatasource,
  PaginationChangedEvent,
  RowClickedEvent,
  SelectionChangedEvent,
  ValueFormatterParams,
} from 'ag-grid-community';
import type { DataPotDto, PotField, PotFieldType, PotPriority, PotRecordDto } from '@datapot/shared';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { DataGrid } from '../components/DataGrid';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Offcanvas } from '../components/Offcanvas';
import { useLocale, useT } from '../i18n';

function formatFieldValue(value: unknown, type: PotFieldType): string {
  if (value == null || value === '') return '';
  switch (type) {
    case 'boolean':
      return value === true || value === 'true' || value === 1 || value === '1' ? '예' : '아니오';
    case 'number':
      return typeof value === 'number' ? String(value) : String(value);
    case 'type':
    case 'date':
    case 'url':
    case 'text':
    default:
      return String(value);
  }
}

const PRIORITY_VALUES: PotPriority[] = ['none', 'low', 'medium', 'high'];
const PRIORITY_LABEL_KEY = {
  none: 'potData.priorityNone',
  low: 'potData.priorityLow',
  medium: 'potData.priorityMedium',
  high: 'potData.priorityHigh',
} as const;

const PRIORITY_TONE: Record<Exclude<PotPriority, 'none'>, string> = {
  low: 'dpot-badge--success',
  medium: 'dpot-badge--warning',
  high: 'dpot-badge--critical',
};

function PriorityCell(
  p: ICellRendererParams<PotRecordDto> & { labels: Record<PotPriority, string> },
) {
  const value = p.data?.priority;
  if (!value || value === 'none') return null;
  return (
    <span className={`dpot-badge dpot-priority-badge ${PRIORITY_TONE[value]}`}>
      {p.labels[value]}
    </span>
  );
}

function VerifiedCell(p: ICellRendererParams<PotRecordDto> & { label: string }) {
  if (!p.data?.confirmed) return null;
  return (
    <span className="dpot-verified-icon" title={p.label} aria-label={p.label}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M6.17 11.83 2.34 8l1.18-1.18 2.65 2.65 6.31-6.31L13.66 4.34z"
        />
      </svg>
    </span>
  );
}

function isTagField(field: PotField): boolean {
  const names = [field.slug, field.nameEn, field.nameKo].map((name) => name.trim().toLowerCase());
  return names.some((name) => name === 'tag' || name === '테그' || name === '태그');
}

function splitTagValue(value: unknown): string[] {
  if (value == null || value === '') return [];
  const parts = Array.isArray(value) ? value.map((item) => String(item)) : String(value).split(',');
  return parts.map((part) => part.trim()).filter(Boolean);
}

function TagBadges({ value, nowrap = false }: { value: unknown; nowrap?: boolean }) {
  const tags = splitTagValue(value);
  if (tags.length === 0) return null;
  return (
    <span className={nowrap ? 'dpot-tag-list dpot-tag-list--nowrap' : 'dpot-tag-list'}>
      {tags.map((tag, index) => (
        <Badge key={`${tag}-${index}`}>{tag}</Badge>
      ))}
    </span>
  );
}

function TypeBadgeCell(p: ICellRendererParams<PotRecordDto> & { fieldSlug: string; splitTags?: boolean }) {
  const raw = p.data?.payload?.[p.fieldSlug];
  if (raw == null || raw === '') return null;
  if (p.splitTags) return <TagBadges value={raw} nowrap />;
  return <Badge>{String(raw)}</Badge>;
}

/** Text/URL columns are truncated in the grid — full value on hover via tooltip */
function isSummaryTextField(field: PotField): boolean {
  return field.type === 'text' || field.type === 'url';
}

function fieldColumn(field: PotField): ColDef<PotRecordDto> {
  const base: ColDef<PotRecordDto> = {
    colId: field.slug,
    headerName: field.nameKo || field.nameEn || field.slug,
    headerTooltip: `${field.nameEn || field.slug}${field.required ? ' · 필수' : ''}`,
    flex: 1,
    minWidth: 120,
    valueGetter: (p) => p.data?.payload?.[field.slug],
  };

  if (field.type === 'type') {
    return {
      ...base,
      cellClass: isTagField(field) ? 'dpot-cell-tags' : undefined,
      cellRenderer: TypeBadgeCell,
      cellRendererParams: { fieldSlug: field.slug, splitTags: isTagField(field) },
      sortable: true,
      filter: false,
      tooltipValueGetter: (p) => {
        const raw = p.data?.payload?.[field.slug];
        return raw == null || raw === '' ? undefined : String(raw);
      },
    };
  }

  const summary = isSummaryTextField(field);
  return {
    ...base,
    valueFormatter: (p: ValueFormatterParams<PotRecordDto>) =>
      formatFieldValue(p.value, field.type),
    cellClass: [
      field.type === 'number' ? 'dpot-mono-cell' : '',
      summary ? 'dpot-cell-summary' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined,
    tooltipValueGetter: summary
      ? (p) => {
          const text = formatFieldValue(p.value, field.type);
          return text || undefined;
        }
      : undefined,
  };
}

function DetailValue({
  value,
  type,
  splitTags,
}: {
  value: unknown;
  type: PotFieldType;
  splitTags?: boolean;
}) {
  if (value == null || value === '') {
    return <span className="dpot-record-detail__empty">—</span>;
  }
  if (type === 'type') {
    if (splitTags) return <TagBadges value={value} />;
    return <Badge>{String(value)}</Badge>;
  }
  if (type === 'boolean') {
    return <>{formatFieldValue(value, type)}</>;
  }
  if (type === 'url') {
    const href = String(value);
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {href}
      </a>
    );
  }
  if (type === 'number') {
    return <span className="dpot-record-detail__value--mono">{formatFieldValue(value, type)}</span>;
  }
  return <>{formatFieldValue(value, type)}</>;
}

const PAGE_SIZE = 20;

type PotRecordPage = {
  total: number;
  items: PotRecordDto[];
};

export function PotDataPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const { locale } = useLocale();
  const [pot, setPot] = useState<DataPotDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detail, setDetail] = useState<PotRecordDto | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const gridHostRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi<PotRecordDto> | null>(null);
  const searchRef = useRef('');
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [pagingPanel, setPagingPanel] = useState<HTMLElement | null>(null);
  const defaultColDef = useMemo(
    () => ({ filter: false, floatingFilter: false, suppressHeaderFilterButton: true }),
    [],
  );

  const loadPot = useCallback(async () => {
    if (!id) return;
    const p = await api<DataPotDto>(`/datapots/${id}`);
    setPot(p);
  }, [id]);

  useEffect(() => {
    searchRef.current = '';
    setSearchDraft('');
    setQuickFilter('');
    setSelectedIds([]);
    setDetail(null);
    loadPot().catch((e) => toast.push('error', e.message));
  }, [loadPot, toast]);

  const datasource = useMemo<IDatasource>(() => {
    return {
      getRows(params) {
        if (!id) {
          params.successCallback([], 0);
          return;
        }
        const limit = Math.max(1, params.endRow - params.startRow);
        const qs = new URLSearchParams({
          offset: String(params.startRow),
          limit: String(limit),
        });
        const q = searchRef.current.trim();
        if (q) qs.set('q', q);
        const sort = params.sortModel[0];
        if (sort?.colId && (sort.sort === 'asc' || sort.sort === 'desc')) {
          qs.set('sort', sort.colId);
          qs.set('dir', sort.sort);
        }
        void api<PotRecordPage>(`/datapots/${id}/records?${qs}`)
          .then((page) => {
            params.successCallback(page.items, page.total);
          })
          .catch((err) => {
            params.failCallback();
            toastRef.current.push(
              'error',
              err instanceof Error ? err.message : 'Failed',
            );
          });
      },
    };
  }, [id]);

  const patchRow = useCallback(
    async (row: PotRecordDto, body: { priority?: PotPriority; confirmed?: boolean }) => {
      if (!id) return;
      const updated = await api<PotRecordDto>(`/datapots/${id}/records/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      gridApiRef.current?.getRowNode(row.id)?.setData(updated);
      setDetail((cur) => (cur?.id === updated.id ? updated : cur));
    },
    [id],
  );

  const cols = useMemo<ColDef<PotRecordDto>[]>(() => {
    const schemaCols = (pot?.fields ?? []).map(fieldColumn);
    const priorityLabels: Record<PotPriority, string> = {
      none: t(PRIORITY_LABEL_KEY.none),
      low: t(PRIORITY_LABEL_KEY.low),
      medium: t(PRIORITY_LABEL_KEY.medium),
      high: t(PRIORITY_LABEL_KEY.high),
    };
    return [
      { field: 'seq', headerName: t('potData.seq'), width: 60, minWidth: 60, pinned: 'left' },
      {
        colId: 'priority',
        field: 'priority',
        headerName: t('potData.priority'),
        width: 60,
        minWidth: 60,
        pinned: 'left',
        sortable: true,
        cellClass: 'dpot-cell-priority',
        cellRenderer: PriorityCell,
        cellRendererParams: { labels: priorityLabels },
      },
      {
        colId: 'confirmed',
        field: 'confirmed',
        headerName: t('potData.confirmed'),
        width: 60,
        minWidth: 60,
        pinned: 'left',
        sortable: true,
        cellClass: 'dpot-cell-verified',
        cellRenderer: VerifiedCell,
        cellRendererParams: { label: t('potData.confirmed') },
      },
      ...schemaCols,
      {
        field: 'createdAt',
        headerName: t('potData.createdAt'),
        width: 200,
        valueFormatter: (p) =>
          p.value
            ? new Date(String(p.value)).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
            : '',
      },
    ];
  }, [pot?.fields, t, locale]);

  function onSelectionChanged(e: SelectionChangedEvent<PotRecordDto>) {
    const selected = e.api.getSelectedRows();
    setSelectedIds(selected.map((r) => r.id).filter(Boolean));
  }

  function onRowClicked(e: RowClickedEvent<PotRecordDto>) {
    const target = e.event?.target as HTMLElement | null | undefined;
    if (target?.closest('.ag-selection-checkbox, .ag-checkbox-input, .ag-header-cell, select, input, button, a')) {
      return;
    }
    if (!e.data) return;
    setDetail(e.data);
  }

  function openDeleteConfirm() {
    if (selectedIds.length === 0 || deleting) return;
    setConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    if (deleting) return;
    setConfirmOpen(false);
  }

  async function confirmDelete() {
    if (!id || selectedIds.length === 0) return;
    setDeleting(true);
    try {
      const res = await api<{ ok: boolean; deleted: number }>(
        `/datapots/${id}/records/delete`,
        {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds }),
        },
      );
      setConfirmOpen(false);
      setDetail((cur) => (cur && selectedIds.includes(cur.id) ? null : cur));
      toast.push('success', t('potData.deleted', { count: res.deleted }));
      setSelectedIds([]);
      gridApiRef.current?.deselectAll();
      gridApiRef.current?.purgeInfiniteCache();
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('potData.deleteFail'));
    } finally {
      setDeleting(false);
    }
  }

  function reloadFromServer() {
    setSelectedIds([]);
    const grid = gridApiRef.current;
    grid?.deselectAll();
    if (grid && grid.paginationGetCurrentPage() !== 0) {
      grid.paginationGoToFirstPage();
    }
    grid?.purgeInfiniteCache();
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const next = searchDraft.trim();
    searchRef.current = next;
    setQuickFilter(next);
    reloadFromServer();
  }

  function clearSearch() {
    setSearchDraft('');
    searchRef.current = '';
    setQuickFilter('');
    reloadFromServer();
  }

  function onGridReady(e: GridReadyEvent<PotRecordDto>) {
    gridApiRef.current = e.api;
    const panel = gridHostRef.current?.querySelector('.ag-paging-panel');
    setPagingPanel(panel instanceof HTMLElement ? panel : null);
  }

  function onPaginationChanged(e: PaginationChangedEvent<PotRecordDto>) {
    const size = e.api.paginationGetPageSize();
    if (size > 0 && e.api.getGridOption('cacheBlockSize') !== size) {
      e.api.setGridOption('cacheBlockSize', size);
    }
  }

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
          <h1 className="dpot-page-title">
            {pot?.name
              ? t('potData.title', { name: pot.name })
              : t('potData.titleFallback')}
          </h1>
        </div>
        <div className="dpot-actions">
          <button
            type="button"
            className="dpot-btn danger"
            disabled={selectedIds.length === 0 || deleting}
            onClick={openDeleteConfirm}
          >
            {selectedIds.length > 0
              ? t('potData.deleteSelectedN', { count: selectedIds.length })
              : t('potData.deleteSelected')}
          </button>
        </div>
      </div>

      <div className="dpot-grid-host" ref={gridHostRef}>
        <DataGrid
          key={id}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={PAGE_SIZE}
          maxBlocksInCache={1}
          infiniteInitialRowCount={PAGE_SIZE}
          columnDefs={cols}
          defaultColDef={defaultColDef}
          suppressMultiSort
          rowSelection={{
            mode: 'multiRow',
            checkboxes: true,
            headerCheckbox: true,
            enableClickSelection: false,
            selectAll: 'currentPage',
          }}
          selectionColumnDef={{
            pinned: 'left',
            width: 48,
            maxWidth: 48,
            resizable: false,
            sortable: false,
          }}
          enableBrowserTooltips
          tooltipShowDelay={400}
          getRowId={(p) => p.data.id}
          onGridReady={onGridReady}
          onPaginationChanged={onPaginationChanged}
          onSelectionChanged={onSelectionChanged}
          onRowClicked={onRowClicked}
        />
        {pagingPanel
          ? createPortal(
              <form className="dpot-paging-search" onSubmit={onSearchSubmit}>
                <input
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={t('potData.searchPlaceholder')}
                  aria-label={t('potData.searchPlaceholder')}
                />
                <button type="submit" className="dpot-btn primary">
                  {t('common.search')}
                </button>
                {quickFilter ? (
                  <button type="button" className="dpot-btn" onClick={clearSearch}>
                    {t('common.clear')}
                  </button>
                ) : null}
              </form>,
              pagingPanel,
            )
          : null}
      </div>

      <Offcanvas
        open={Boolean(detail)}
        title={detail ? `seq ${detail.seq}` : '데이터'}
        onClose={() => setDetail(null)}
        width={480}
      >
        {detail ? (
          <dl className="dpot-record-detail">
            <div className="dpot-record-detail__row">
              <dt className="dpot-record-detail__label">seq</dt>
              <dd className="dpot-record-detail__value dpot-record-detail__value--mono">
                {detail.seq}
              </dd>
            </div>
            <div className="dpot-record-detail__row">
              <dt className="dpot-record-detail__label">{t('potData.priority')}</dt>
              <dd className="dpot-record-detail__value">
                <div className="dpot-seg" role="group" aria-label={t('potData.priority')}>
                  {PRIORITY_VALUES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="dpot-seg__btn"
                      aria-pressed={detail.priority === value}
                      onClick={() => {
                        if (detail.priority === value) return;
                        void patchRow(detail, { priority: value }).catch((err) =>
                          toast.push(
                            'error',
                            err instanceof Error ? err.message : t('potData.saveFail'),
                          ),
                        );
                      }}
                    >
                      {t(PRIORITY_LABEL_KEY[value])}
                    </button>
                  ))}
                </div>
              </dd>
            </div>
            <div className="dpot-record-detail__row">
              <dt className="dpot-record-detail__label">{t('potData.confirmed')}</dt>
              <dd className="dpot-record-detail__value">
                <button
                  type="button"
                  className="dpot-switch"
                  role="switch"
                  aria-checked={detail.confirmed === true}
                  aria-label={t('potData.confirmed')}
                  onClick={() => {
                    void patchRow(detail, { confirmed: !detail.confirmed }).catch((err) =>
                      toast.push(
                        'error',
                        err instanceof Error ? err.message : t('potData.saveFail'),
                      ),
                    );
                  }}
                />
              </dd>
            </div>
            {(pot?.fields ?? []).map((field) => (
              <div key={field.slug} className="dpot-record-detail__row">
                <dt className="dpot-record-detail__label">
                  {field.nameKo || field.nameEn || field.slug}
                </dt>
                <dd className="dpot-record-detail__value">
                  <DetailValue
                    value={detail.payload?.[field.slug]}
                    type={field.type}
                    splitTags={isTagField(field)}
                  />
                </dd>
              </div>
            ))}
            <div className="dpot-record-detail__row">
              <dt className="dpot-record-detail__label">{t('potData.createdAt')}</dt>
              <dd className="dpot-record-detail__value">
                {detail.createdAt
                  ? new Date(detail.createdAt).toLocaleString(
                      locale === 'ko' ? 'ko-KR' : 'en-US',
                    )
                  : t('common.none')}
              </dd>
            </div>
            <div className="dpot-record-detail__row">
              <dt className="dpot-record-detail__label">{t('potData.id')}</dt>
              <dd className="dpot-record-detail__value dpot-record-detail__value--mono">
                {detail.id}
              </dd>
            </div>
          </dl>
        ) : null}
      </Offcanvas>

      <Modal
        open={confirmOpen}
        title={t('potData.deleteTitle')}
        onClose={closeDeleteConfirm}
        width={420}
        footer={
          <>
            <button
              type="button"
              className="dpot-btn"
              disabled={deleting}
              onClick={closeDeleteConfirm}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="dpot-btn danger"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? t('common.deleting') : t('common.delete')}
            </button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {t('potData.deleteBody', { count: selectedIds.length })}
          <br />
          <span style={{ color: 'var(--slate-500)', fontSize: 13 }}>
            {t('potData.deleteIrreversible')}
          </span>
        </p>
      </Modal>
    </div>
  );
}
