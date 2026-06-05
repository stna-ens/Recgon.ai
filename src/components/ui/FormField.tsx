'use client';

import { cloneElement, isValidElement } from 'react';

export interface FormFieldProps {
  label: string;
  /** id of the wrapped input — wires label, error and hint together. */
  htmlFor: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

/**
 * Form row: label + input + error/hint, with accessibility wired in.
 * Clones the child input to inject `id`, `aria-invalid` and
 * `aria-describedby` pointing at the error/hint elements.
 */
export function FormField({ label, htmlFor, error, hint, required, children }: FormFieldProps) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;

  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ui-field-req" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {child}
      {error ? (
        <div className="ui-field-error" id={errorId} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="ui-field-hint" id={hintId}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
