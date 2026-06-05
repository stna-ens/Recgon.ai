'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useTranslations } from 'next-intl';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger variant. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

/**
 * Imperative confirmation — drop-in replacement for `window.confirm`:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: t('confirm.title'), destructive: true }))) return;
 *
 * Renders a branded Radix AlertDialog (focus trap, Escape, scrim) via the
 * ConfirmProvider mounted in the root layout.
 */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(options);
      setOpen(true);
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <AlertDialog.Root
          open={open}
          onOpenChange={(next) => {
            // Escape / overlay click — resolve as "cancelled".
            if (!next) settle(false);
          }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="ui-modal-overlay" />
            <AlertDialog.Content className="ui-modal ui-modal--sm">
              <AlertDialog.Title className="ui-modal-title">{opts.title}</AlertDialog.Title>
              {opts.description && (
                <AlertDialog.Description className="ui-modal-desc">
                  {opts.description}
                </AlertDialog.Description>
              )}
              <div className="ui-modal-footer">
                <AlertDialog.Cancel asChild>
                  <Button variant="ghost">{opts.cancelLabel ?? t('cancel')}</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button
                    variant={opts.destructive ? 'danger' : 'primary'}
                    onClick={() => settle(true)}
                  >
                    {opts.confirmLabel ?? t('confirm')}
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </ConfirmContext.Provider>
  );
}
