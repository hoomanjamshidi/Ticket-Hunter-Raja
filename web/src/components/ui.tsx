/** اجزای پایه‌ی رابط کاربری — دکمه، کارت، برچسب وضعیت، فیلد فرم. */
import type { CSSProperties, ReactNode } from 'react';
import './ui.css';

export function Card({
  title,
  actions,
  children,
  style,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section className="card" style={style}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'danger';

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/**
 * نشانگر وضعیت.
 * طبق قاعده‌ی دسترس‌پذیری، رنگ تنها حامل معنا نیست — متن همیشه همراهش است.
 */
export function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="status">
      <span className="status-dot" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </label>
  );
}

/** حالت خالی — همیشه توضیح می‌دهد چرا خالی است و قدم بعدی چیست. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

/** بنر هشدار/اطلاع — برای رویدادهایی که کاربر باید فوراً ببیند. */
export function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  return (
    <div className={`banner banner-${tone}`} role="status">
      {children}
    </div>
  );
}
