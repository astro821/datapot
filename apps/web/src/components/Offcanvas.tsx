import { ReactNode, useEffect } from 'react';

type OffcanvasProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
};

export function Offcanvas({ open, title, onClose, children, width = 420 }: OffcanvasProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fops-offcanvas-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="fops-offcanvas"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpot-offcanvas-title"
        style={{ width: `min(${width}px, calc(100vw - 24px))` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fops-offcanvas-header">
          <h2 id="dpot-offcanvas-title" className="fops-offcanvas-title">
            {title}
          </h2>
          <button type="button" className="dpot-modal__close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fops-offcanvas-body">{children}</div>
      </aside>
    </div>
  );
}
