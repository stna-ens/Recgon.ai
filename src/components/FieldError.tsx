'use client';

interface FieldErrorProps {
  id?: string;
  children?: React.ReactNode;
}

export default function FieldError({ id, children }: FieldErrorProps) {
  if (!children) return null;
  return (
    <div id={id} className="field-error" role="alert" aria-live="polite">
      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
