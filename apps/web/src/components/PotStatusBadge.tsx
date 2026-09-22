import { useT } from '../i18n';

type PotStatusBadgeProps = {
  enabled: boolean;
  listening: boolean;
  bindError?: string | null;
};

export function PotStatusBadge({ enabled, listening, bindError }: PotStatusBadgeProps) {
  const t = useT();
  if (listening) {
    return <span className="dpot-badge dpot-badge--success">{t('common.active')}</span>;
  }
  if (enabled) {
    return (
      <span className="dpot-badge dpot-badge--warning" title={bindError || undefined}>
        {t('common.bindFailed')}
      </span>
    );
  }
  return <span className="dpot-badge dpot-badge--neutral">{t('common.inactive')}</span>;
}
