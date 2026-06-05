'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Action row rendered below the body (usually <Button>s). */
  footer?: React.ReactNode;
  /** Hide the top-right close button. */
  hideClose?: boolean;
  children?: React.ReactNode;
}

/**
 * Shared modal — Radix Dialog wrapper with the app's glass treatment.
 * Focus trap, Escape-to-close, click-outside and scroll lock come from Radix.
 * Styles: `.ui-modal` in globals.css.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  hideClose,
  children,
}: ModalProps) {
  const t = useTranslations('common');
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal-overlay" />
        <Dialog.Content className={`ui-modal ui-modal--${size}`}>
          <div className="ui-modal-head">
            <Dialog.Title className="ui-modal-title">{title}</Dialog.Title>
            {!hideClose && (
              <Dialog.Close asChild>
                <button type="button" className="ui-modal-x" aria-label={t('close')}>
                  ✕
                </button>
              </Dialog.Close>
            )}
          </div>
          {description && (
            <Dialog.Description className="ui-modal-desc">{description}</Dialog.Description>
          )}
          {children != null && <div className="ui-modal-body">{children}</div>}
          {footer && <div className="ui-modal-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
