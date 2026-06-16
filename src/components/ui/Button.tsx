'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'danger-ghost'
  | 'warn'
  | 'success';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Shows a spinner and disables the button while true. */
  loading?: boolean;
  /** Render the child element instead of a <button> (Radix Slot). */
  asChild?: boolean;
}

/**
 * Shared app button. Styles live in globals.css under `.ui-btn` —
 * visual base inherited from the calendar's `.cal-panel-btn` (uppercase
 * JetBrains Mono, 2px radius, signature-pink primary).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, asChild = false, className, type, disabled, children, ...rest },
  ref,
) {
  const cls = ['ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, className]
    .filter(Boolean)
    .join(' ');

  if (asChild) {
    // Slot requires a single child; spinner injection doesn't apply here.
    return (
      <Slot ref={ref} className={cls} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cls}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="ui-btn-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
