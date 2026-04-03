'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { downloadUrl, type FileItem } from '@/lib/api';
import { fileHref } from '@/lib/routes';
import { useLocale } from './providers';
import { FilePreview } from './share/file-preview';

type Props = {
  files: FileItem[];
  fileId: string | null;
  onSelectFile: (id: string) => void;
  onDismiss: () => void;
  onExpired: () => void;
};

export function QuickPreviewDialog({ files, fileId, onSelectFile, onDismiss, onExpired }: Props) {
  const { locale, text } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const currentIndex = fileId ? files.findIndex((entry) => entry.id === fileId) : -1;
  const activeFile = currentIndex >= 0 ? files[currentIndex] : null;
  const vi = locale === 'vi';

  useEffect(() => {
    if (!activeFile || files.length <= 1) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = files[(currentIndex - 1 + files.length) % files.length];
        if (prev) onSelectFile(prev.id);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = files[(currentIndex + 1) % files.length];
        if (next) onSelectFile(next.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFile, currentIndex, files, onSelectFile]);

  if (!activeFile) return null;

  return (
    <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen) onDismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ux-backdrop-enter fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm" />
        <Dialog.Content
          data-testid="quick-preview-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          className="fixed inset-3 z-[75] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-elevated text-ink shadow-2xl focus:outline-none sm:inset-6"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Dialog.Title className="truncate text-sm font-semibold sm:text-base">{activeFile.originalName}</Dialog.Title>
              <Dialog.Description className="sr-only">
                {vi ? 'Xem nhanh nội dung tệp' : 'Quick file preview'}
              </Dialog.Description>
              {files.length > 1 && (
                <span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium tabular-nums text-ink-secondary">
                  {currentIndex + 1} / {files.length}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {files.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={vi ? 'Tệp trước' : 'Previous file'}
                    title={vi ? 'Tệp trước (Mũi tên trái)' : 'Previous file (Left arrow)'}
                    className="icon-button"
                    onClick={() => {
                      const prev = files[(currentIndex - 1 + files.length) % files.length];
                      if (prev) onSelectFile(prev.id);
                    }}
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={vi ? 'Tệp sau' : 'Next file'}
                    title={vi ? 'Tệp sau (Mũi tên phải)' : 'Next file (Right arrow)'}
                    className="icon-button"
                    onClick={() => {
                      const next = files[(currentIndex + 1) % files.length];
                      if (next) onSelectFile(next.id);
                    }}
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </>
              )}
              <Link
                href={fileHref(activeFile.id)}
                prefetch={false}
                className="button button-secondary min-h-9 px-3 text-xs sm:text-sm"
                onClick={onDismiss}
              >
                <ArrowTopRightOnSquareIcon aria-hidden="true" className="h-4 w-4" />
                {text.fileDetails}
              </Link>
              <a
                href={downloadUrl(activeFile.id)}
                download={activeFile.originalName}
                className="button button-primary min-h-9 px-3 text-xs sm:text-sm"
              >
                <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
                {text.download}
              </a>
              <button
                ref={closeRef}
                type="button"
                className="icon-button"
                aria-label={text.close}
                onClick={onDismiss}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto ux-scroll-contain p-4 sm:p-6">
            <FilePreview key={activeFile.id} fileId={activeFile.id} name={activeFile.originalName} onExpired={onExpired} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
