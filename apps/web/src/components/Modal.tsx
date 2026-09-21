import { ReactNode, useEffect } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

export function Modal({ open, title, onClose, children, footer, width = 480 }: ModalProps) {
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
    <div className="dpot-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dpot-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpot-modal-title"
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dpot-modal__head">
          <h2 id="dpot-modal-title" className="dpot-modal__title">
            {title}
          </h2>
          <button type="button" className="dpot-modal__close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dpot-modal__body">{children}</div>
        {footer ? <div className="dpot-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
