import { FormEvent, ReactNode, useState } from 'react';
import brandSvg from '../assets/images/brand-light.svg';
import { useT } from '../i18n';

type AuthSplitLayoutProps = {
  children: ReactNode;
};

export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="login-start-page fops-auth-page">
      <div className="auth">
        <section className="auth-brand">
          <div className="ab-head" />

          <div className="ab-copy">
            <div className="ab-head-link" aria-label="DATAPOT">
              <div className="ab-mark">
                <img src={brandSvg} alt="" width={72} height={72} aria-hidden />
              </div>
              <div className="ab-name">DATAPOT</div>
            </div>
          </div>

          <div className="ab-foot">
            <div>© 2026 DATAPOT</div>
          </div>
        </section>

        <section className="auth-form-wrap">
          <div className="auth-form">{children}</div>
        </section>
      </div>
    </div>
  );
}

type PasswordFieldProps = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  showLabel?: string;
  hideLabel?: string;
  autoComplete?: string;
  disabled?: boolean;
};

export function AuthPasswordField({
  id,
  value,
  onChange,
  label,
  showLabel,
  hideLabel,
  autoComplete = 'current-password',
  disabled,
}: PasswordFieldProps) {
  const t = useT();
  const [show, setShow] = useState(false);
  const resolvedLabel = label ?? t('login.password');
  const resolvedShow = showLabel ?? t('login.showPassword');
  const resolvedHide = hideLabel ?? t('login.hidePassword');
  return (
    <div className="af-row">
      <label className="form-label" htmlFor={id}>
        {resolvedLabel}
      </label>
      <div className="input-with-icon">
        <svg className="lead" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="form-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={!disabled}
          disabled={disabled}
        />
        {!disabled ? (
          <button
            type="button"
            className="reveal"
            aria-label={show ? resolvedHide : resolvedShow}
            onClick={() => setShow((s) => !s)}
          >
            {show ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M3 3l18 18M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4 10 7-.4 1.2-1.2 2.6-2.4 3.8M6.1 6.1C4.4 7.4 3.3 9 3 12c1 3 5 7 9 7 1.3 0 2.5-.3 3.6-.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type TextFieldProps = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
};

export function AuthTextField({
  id,
  value,
  onChange,
  label,
  autoComplete = 'username',
  autoFocus,
  disabled,
}: TextFieldProps) {
  const t = useT();
  const resolvedLabel = label ?? t('login.username');
  return (
    <div className="af-row">
      <label className="form-label" htmlFor={id}>
        {resolvedLabel}
      </label>
      <div className="input-with-icon">
        <svg className="lead" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <input
          id={id}
          className="form-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={!disabled}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function AuthSubmitButton({
  busy,
  children,
  disabled,
}: {
  busy?: boolean;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className="btn-submit" type="submit" disabled={disabled || busy}>
      {children}
    </button>
  );
}

export type { FormEvent };
