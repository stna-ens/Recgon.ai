'use client';

import { forwardRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const EyeIcon = ({ off }: { off?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
    {off && <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
);

/**
 * Password input with a show/hide toggle. Pairs with FormField:
 *
 *   <FormField label={t('password')} htmlFor="password" error={err}>
 *     <PasswordInput value={v} onChange={...} autoComplete="current-password" />
 *   </FormField>
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...rest }, ref) {
    const t = useTranslations('auth');
    const [show, setShow] = useState(false);
    return (
      <div className="ui-input-wrap">
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={['ui-input', className].filter(Boolean).join(' ')}
          {...rest}
        />
        <button
          type="button"
          className="ui-input-toggle"
          aria-label={show ? t('hidePassword') : t('showPassword')}
          onClick={() => setShow((s) => !s)}
        >
          <EyeIcon off={show} />
        </button>
      </div>
    );
  },
);
