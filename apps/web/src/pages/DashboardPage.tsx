import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PotDailyCount, PotOverviewDto, PotTrendDto } from '@datapot/shared';
import { api } from '../lib/api';
import { useLocale, useT } from '../i18n';

const FAV_KEY = 'dpot.favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveFavorites(ids: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...ids]));
}

function formatDateTime(iso: string | null, locale: string, emptyLabel: string): string {
  if (!iso) return emptyLabel;
  try {
    return new Date(iso).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type HeatCell = { date: string | null; count: number };

/** Weeks as columns, Sun→Sat rows — GitHub-style contribution heatmap */
function buildHeatmapWeeks(days: PotDailyCount[]): HeatCell[][] {
  if (days.length === 0) return [];
  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const first = parseDay(days[0]!.date);
  const last = parseDay(days[days.length - 1]!.date);

  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - cursor.getDay()); // align to Sunday

  const weeks: HeatCell[][] = [];
  const guard = new Date(last);
  guard.setDate(guard.getDate() + 7);

  while (cursor <= last || weeks.length === 0) {
    const week: HeatCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const key = dayKey(cursor);
      const inRange = cursor >= first && cursor <= last;
      week.push({
        date: inRange ? key : null,
        count: inRange ? byDate.get(key) ?? 0 : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor > last) break;
    if (cursor > guard) break;
  }
  return weeks;
}

function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (max <= 1) return count > 0 ? 4 : 0;
  const r = count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

const HEAT_CELL = 10;
const HEAT_GAP = 3;
const HEAT_MONTH_H = 14;
const HEAT_COLORS = [
  'var(--slate-100)',
  'color-mix(in srgb, var(--primary-500) 28%, #e8f5e9)',
  'color-mix(in srgb, var(--primary-500) 48%, #c8e6c9)',
  'color-mix(in srgb, var(--primary-600) 72%, #81c784)',
  'var(--primary-700, #2e7d32)',
] as const;

function ContributionHeatmap({ days }: { days: PotDailyCount[] }) {
  const t = useT();
  const { locale } = useLocale();
  const weeks = useMemo(() => buildHeatmapWeeks(days), [days]);
  const max = useMemo(() => Math.max(0, ...days.map((d) => d.count)), [days]);
  const loc = locale === 'ko' ? 'ko-KR' : 'en-US';

  const monthLabels = useMemo(() => {
    let prevMonth = -1;
    return weeks.map((week) => {
      const firstDated = week.find((c) => c.date);
      if (!firstDated?.date) return '';
      const d = parseDay(firstDated.date);
      const month = d.getMonth();
      if (month === prevMonth) return '';
      prevMonth = month;
      return d.toLocaleString(loc, { month: 'short' });
    });
  }, [weeks, loc]);

  const weekStride = HEAT_CELL + HEAT_GAP;
  const svgW = Math.max(0, weeks.length * weekStride - HEAT_GAP);
  const gridH = 7 * weekStride - HEAT_GAP;
  const svgH = gridH + HEAT_MONTH_H;

  if (weeks.length === 0) return null;

  return (
    <div className="dpot-heatmap">
      <div className="dpot-heatmap__body">
        <svg
          className="dpot-heatmap__svg"
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          role="img"
          aria-label={t('dashboard.heatmapAria')}
        >
          {weeks.map((week, wi) => {
            const x = wi * weekStride;
            return (
              <g key={wi}>
                {week.map((cell, di) => {
                  if (!cell.date) return null;
                  const y = di * weekStride;
                  const level = heatLevel(cell.count, max);
                  return (
                    <rect
                      key={cell.date}
                      x={x}
                      y={y}
                      width={HEAT_CELL}
                      height={HEAT_CELL}
                      rx={2}
                      ry={2}
                      fill={HEAT_COLORS[level]}
                    >
                      <title>
                        {t('dashboard.heatmapDay', {
                          date: cell.date,
                          count: cell.count,
                        })}
                      </title>
                    </rect>
                  );
                })}
                {monthLabels[wi] ? (
                  <text
                    x={x}
                    y={gridH + 11}
                    className="dpot-heatmap__month-label"
                  >
                    {monthLabels[wi]}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function formatDay(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function StatGlyph({ kind }: { kind: 'pots' | 'rows' | 'period' | 'today' | 'last' | 'unverified' }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      {kind === 'pots' ? (
        <path d="M7 10h10l-1 9H8l-1-9Zm2-3V6a3 3 0 0 1 6 0v1" {...stroke} />
      ) : null}
      {kind === 'rows' ? (
        <path d="M4 6h16M4 12h16M4 18h10" {...stroke} />
      ) : null}
      {kind === 'period' ? (
        <path d="M7 4v3M17 4v3M5 8h14v12H5V8Zm3 5h3m3 0h3" {...stroke} />
      ) : null}
      {kind === 'today' ? (
        <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" {...stroke} />
      ) : null}
      {kind === 'last' ? (
        <path d="M12 8v4l2.5 1.5M5 12a7 7 0 1 0 2-4.9L5 5v5h5" {...stroke} />
      ) : null}
      {kind === 'unverified' ? (
        <path d="M9 12.5 11 14.5 15.5 10M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" {...stroke} />
      ) : null}
    </svg>
  );
}

const TREND_COLORS = [
  '#2e7d32',
  '#1565c0',
  '#ef6c00',
  '#6a1b9a',
  '#c62828',
  '#00838f',
  '#6d4c41',
  '#ad1457',
  '#4527a0',
  '#558b2f',
];

function TrendChart({ data, title }: { data: PotTrendDto; title: string }) {
  const t = useT();
  const { locale } = useLocale();
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotSize, setPlotSize] = useState({ width: 640, height: 120 });
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(160, Math.floor(rect.width));
      const height = Math.max(72, Math.floor(rect.height));
      setPlotSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { width, height } = plotSize;
  const pad = { l: 36, r: 8, t: 8, b: 18 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...data.series.flatMap((series) => series.counts));
  const lastIndex = Math.max(1, data.dates.length - 1);
  const xAt = (index: number) => pad.l + (index / lastIndex) * innerW;
  const yAt = (value: number) => pad.t + innerH - (value / max) * innerH;
  const loc = locale === 'ko' ? 'ko-KR' : 'en-US';
  const monthTicks: { index: number; label: string }[] = [];
  let prevMonth = -1;
  data.dates.forEach((date, index) => {
    const parsed = parseDay(date);
    if (parsed.getMonth() === prevMonth) return;
    prevMonth = parsed.getMonth();
    monthTicks.push({ index, label: parsed.toLocaleString(loc, { month: 'short' }) });
  });

  return (
    <div className="dpot-trend">
      <div className="dpot-trend__title">{title}</div>
      {data.series.length === 0 ? (
        <p className="dpot-trend__empty">{t('dashboard.trendNone')}</p>
      ) : (
        <>
          <div className="dpot-trend__plot" ref={plotRef}>
          <svg
            className="dpot-trend__svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={title}
          >
            {[0, 0.5, 1].map((ratio) => {
              const y = yAt(max * ratio);
              const value = Math.round(max * ratio);
              return (
                <g key={ratio}>
                  <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="dpot-trend__grid" />
                  <text x={pad.l - 8} y={y + 4} className="dpot-trend__tick" textAnchor="end">
                    {value}
                  </text>
                </g>
              );
            })}
            {monthTicks.map((tick) => (
              <text
                key={tick.index}
                x={xAt(tick.index)}
                y={height - 8}
                className="dpot-trend__tick"
              >
                {tick.label}
              </text>
            ))}
            {data.series.map((series, seriesIndex) => {
              const points = series.counts
                .map((count, index) => `${xAt(index)},${yAt(count)}`)
                .join(' ');
              return (
                <polyline
                  key={series.label}
                  points={points}
                  fill="none"
                  stroke={TREND_COLORS[seriesIndex % TREND_COLORS.length]}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          </div>
          <ul className="dpot-trend__legend">
            {data.series.map((series, seriesIndex) => (
              <li key={series.label}>
                <span
                  className="dpot-trend__swatch"
                  style={{ background: TREND_COLORS[seriesIndex % TREND_COLORS.length] }}
                />
                {series.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashboardPage() {
  const t = useT();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [items, setItems] = useState<PotOverviewDto[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuPotId, setMenuPotId] = useState<string | null>(null);
  const [trend, setTrend] = useState<{ potId: string; field: string } | null>(null);
  const [trendData, setTrendData] = useState<{ potId: string; data: PotTrendDto } | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await api<PotOverviewDto[]>('/datapots/overview');
      setItems(overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuPotId) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.dpot-more')) setMenuPotId(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuPotId(null);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuPotId]);

  useEffect(() => {
    if (!trend) {
      setTrendData(null);
      setTrendError(null);
      return;
    }
    let cancel = false;
    setTrendData(null);
    setTrendError(null);
    api<PotTrendDto>(
      `/datapots/${trend.potId}/trend?field=${encodeURIComponent(trend.field)}`,
    )
      .then((data) => {
        if (!cancel) setTrendData({ potId: trend.potId, data });
      })
      .catch((err) => {
        if (!cancel) {
          setTrendData(null);
          setTrendError(err instanceof Error ? err.message : t('dashboard.trendNone'));
        }
      });
    return () => {
      cancel = true;
    };
  }, [trend, t]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }

  const summary = useMemo(() => {
    const loc = locale === 'ko' ? 'ko-KR' : 'en-US';
    const unit = t('dashboard.countUnit');
    const formatCount = (n: number) => {
      const text = n.toLocaleString(loc);
      return unit ? `${text}${unit}` : text;
    };
    const totalRows = items.reduce((sum, pot) => sum + pot.recordCount, 0);
    const unverified = items.reduce((sum, pot) => sum + (pot.unverifiedCount ?? 0), 0);
    const todayKey = dayKey(new Date());
    const today = items.reduce(
      (sum, pot) => sum + (pot.dailyCounts.find((day) => day.date === todayKey)?.count ?? 0),
      0,
    );
    const firsts = items.map((pot) => pot.firstCreatedAt).filter((v): v is string => Boolean(v));
    const lasts = items.map((pot) => pot.lastCreatedAt).filter((v): v is string => Boolean(v));
    const first = firsts.reduce<string | null>(
      (min, iso) => (min == null || iso < min ? iso : min),
      null,
    );
    const last = lasts.reduce<string | null>(
      (max, iso) => (max == null || iso > max ? iso : max),
      null,
    );
    let period = t('dashboard.noData');
    if (first && last) {
      const start = formatDay(first, locale);
      const end = formatDay(last, locale);
      period = start === end ? start : `${start} – ${end}`;
    }
    return {
      pots: formatCount(items.length),
      totalRows: formatCount(totalRows),
      period,
      today: formatCount(today),
      last: formatDateTime(last, locale, t('dashboard.noData')),
      unverified: formatCount(unverified),
    };
  }, [items, locale, t]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const af = favorites.has(a.id) ? 0 : 1;
      const bf = favorites.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [items, favorites]);

  return (
    <div className="fops-admin-page">
      <div className="dpot-page-head">
        <div>
          <h1 className="dpot-page-title">{t('dashboard.title')}</h1>
          <p className="dpot-page-sub">{t('dashboard.subtitle')}</p>
        </div>
        <div className="dpot-actions">
          <button className="dpot-btn" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? t('dashboard.loading') : t('dashboard.refresh')}
          </button>
          <Link className="dpot-btn primary" to="/datapots">
            {t('dashboard.manage')}
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        {(
          [
            ['pots', t('dashboard.pots'), summary.pots, false],
            ['rows', t('dashboard.totalRows'), summary.totalRows, false],
            ['period', t('dashboard.period'), summary.period, true],
            ['today', t('dashboard.today'), summary.today, false],
            ['last', t('dashboard.lastCollect'), summary.last, true],
            ['unverified', t('dashboard.unverified'), summary.unverified, false],
          ] as const
        ).map(([kind, label, value, compact]) => (
          <div className="stat-tile" key={kind}>
            <span className="stat-tile__icon">
              <StatGlyph kind={kind} />
            </span>
            <div className="stat-tile__body">
              <div className="label">{label}</div>
              <div className={compact ? 'value value--compact' : 'value'}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="dpot-conn-status dpot-conn-status--fail" role="alert">
          {error}
        </div>
      ) : null}

      <div className="dpot-dash-section" role="separator">
        <span>DATAPOT.</span>
      </div>

      {loading && items.length === 0 ? (
        <p style={{ color: 'var(--slate-500)' }}>{t('dashboard.loading')}</p>
      ) : sorted.length === 0 ? (
        <div className="dpot-card">
          <p style={{ color: 'var(--slate-500)', margin: 0 }}>
            {t('dashboard.empty')}{' '}
            <Link to="/datapots">{t('dashboard.addLink')}</Link>
          </p>
        </div>
      ) : (
        <div className="dpot-overview-grid">
          {sorted.map((pot) => {
            const fav = favorites.has(pot.id);
            const trendOn = trend?.potId === pot.id;
            const trendReady =
              trendOn &&
              trendData?.potId === pot.id &&
              trendData.data.field === trend?.field;
            const typeFields = pot.typeFields ?? [];
            const activeField = typeFields.find((field) => field.slug === trend?.field);
            const fieldLabel = activeField
              ? locale === 'ko'
                ? activeField.nameKo || activeField.nameEn || activeField.slug
                : activeField.nameEn || activeField.nameKo || activeField.slug
              : trend?.field || '';
            return (
              <div className="dpot-overview-row" key={pot.id}>
              <article
                className={`dpot-overview-card is-clickable${fav ? ' is-favorite' : ''}${
                  pot.enabled ? '' : ' is-disabled'
                }`}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/datapots/${pot.id}/data`)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/datapots/${pot.id}/data`);
                  }
                }}
              >
                <header className="dpot-overview-card__head">
                  <div className="dpot-overview-card__titles">
                    <span className="dpot-overview-card__name">{pot.name}</span>
                    <div className="dpot-overview-card__meta">
                      <code>{pot.key}</code>
                      <span>:{pot.port}</span>
                      {!pot.enabled ? (
                        <span className="dpot-overview-card__off">{t('dashboard.inactive')}</span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className="dpot-overview-card__actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`dpot-fav-btn${fav ? ' is-on' : ''}`}
                      aria-label={fav ? t('dashboard.favOn') : t('dashboard.favOff')}
                      aria-pressed={fav}
                      title={fav ? t('dashboard.favOn') : t('dashboard.favOff')}
                      onClick={() => toggleFavorite(pot.id)}
                    >
                      <StarIcon filled={fav} />
                    </button>
                    <div className="dpot-more">
                      <button
                        type="button"
                        className="dpot-fav-btn"
                        aria-label={t('dashboard.more')}
                        aria-expanded={menuPotId === pot.id}
                        onClick={() =>
                          setMenuPotId((current) => (current === pot.id ? null : pot.id))
                        }
                      >
                        ···
                      </button>
                      {menuPotId === pot.id ? (
                        <div className="dpot-menu" role="menu">
                          <div className="dpot-menu__label">{t('dashboard.trend')}</div>
                          {typeFields.length === 0 ? (
                            <div className="dpot-menu__empty">{t('dashboard.trendEmpty')}</div>
                          ) : (
                            typeFields.map((field) => (
                              <button
                                key={field.slug}
                                type="button"
                                role="menuitemradio"
                                aria-checked={trendOn && trend?.field === field.slug}
                                className={
                                  trendOn && trend?.field === field.slug
                                    ? 'dpot-menu__item is-on'
                                    : 'dpot-menu__item'
                                }
                                onClick={() => {
                                  setTrendData(null);
                                  setTrendError(null);
                                  setTrend({ potId: pot.id, field: field.slug });
                                  setMenuPotId(null);
                                }}
                              >
                                {locale === 'ko'
                                  ? field.nameKo || field.nameEn || field.slug
                                  : field.nameEn || field.nameKo || field.slug}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </header>

                <dl className="dpot-overview-card__stats">
                  <div>
                    <dt>{t('dashboard.lastIngest')}</dt>
                    <dd>
                      {formatDateTime(pot.lastCreatedAt, locale, t('dashboard.noData'))}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('dashboard.totalItems')}</dt>
                    <dd className="dpot-overview-card__count">
                      {pot.recordCount.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')}
                      {t('dashboard.countUnit') ? (
                        <span>{t('dashboard.countUnit')}</span>
                      ) : null}
                    </dd>
                  </div>
                </dl>

                <ContributionHeatmap days={pot.dailyCounts} />
              </article>
              <div className={trendOn ? 'dpot-trend-slot is-active' : 'dpot-trend-slot'}>
                {trendOn && trendError ? (
                  <p className="dpot-trend__empty">{trendError}</p>
                ) : null}
                {trendReady && trendData ? (
                  <TrendChart data={trendData.data} title={`${pot.name} · ${fieldLabel}`} />
                ) : null}
                {trendOn && !trendError && !trendReady ? (
                  <p className="dpot-trend__empty">{t('dashboard.loading')}</p>
                ) : null}
              </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
