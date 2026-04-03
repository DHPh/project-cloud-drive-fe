'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { type ReactNode, type RefObject } from 'react';
import { useLocale } from './providers';

type Props = {
  open?: boolean;
  testId?: string;
  title: string;
  description: string;
  children: ReactNode;
  onDismiss?: () => void;
  restoreFocus?: HTMLElement | null;
  initialFocus?: RefObject<HTMLElement | null>;
  restoreFallback?: () => void;
};

export function Overlay({ open = true, testId, title, description, children, onDismiss, initialFocus, restoreFocus, restoreFallback }: Props) {
  const { text } = useLocale();

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="ux-backdrop-enter fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          data-testid={testId}
          className="safe-bottom ux-scroll-contain fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          onEscapeKeyDown={(event) => { event.preventDefault(); onDismiss?.(); }}
          onPointerDownOutside={(event) => { event.preventDefault(); onDismiss?.(); }}
          onOpenAutoFocus={(event) => {
            if (!initialFocus?.current) return;
            event.preventDefault();
            initialFocus.current.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocus?.isConnected) restoreFocus.focus();
            else restoreFallback?.();
          }}
        >
          <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</Dialog.Description>
            </div>
            {onDismiss && (
              <button type="button" className="icon-button -mr-2 -mt-1" onClick={onDismiss} aria-label={text.close}>
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
