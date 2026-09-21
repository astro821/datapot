import type { CSSProperties, ReactNode } from 'react';

/** Stable 32-bit hash for badge label → color */
function hashLabel(label: string): number {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function labelText(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(labelText).join('');
  return '';
}

/** Soft pastel chip from label hash (same text → same color) */
export function badgeStyleFromLabel(label: string): CSSProperties {
  const hue = hashLabel(label.trim() || 'badge') % 360;
  return {
    background: `hsl(${hue} 48% 92%)`,
    borderColor: `hsl(${hue} 36% 78%)`,
    color: `hsl(${hue} 42% 28%)`,
  };
}

export function Badge({ children }: { children: ReactNode; tone?: string }) {
  const text = labelText(children);
  const style = badgeStyleFromLabel(text);
  return (
    <span className="dpot-badge" style={style}>
      {children}
    </span>
  );
}

export function roleLabel(role: 'admin' | 'user'): string {
  return role === 'admin' ? '관리자' : '사용자';
}
