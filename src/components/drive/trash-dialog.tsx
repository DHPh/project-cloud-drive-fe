'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, trashFile, type FileItem } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type Props = {
  file: FileItem;
  trigger: HTMLElement;
  suspended: boolean;
  onDismiss: () => void;
  onExpired: () => void;
  onMoved: (fileId: string) => void;
  focusAfterMove: () => void;
};

export function TrashDialog({ file, trigger, suspended, onDismiss, onExpired, onMoved, focusAfterMove }: Props) {
  const { text } = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const moved = useRef(false);

  useEffect(() => () => request.current?.abort(), []);

  function dismiss() {
    if (!request.current) onDismiss();
  }

  async function submit() {
    if (request.current || moved.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const result = await trashFile(file.id, controller.signal);
      if (controller.signal.aborted) return;
      moved.current = true;
      onMoved(result.id);
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(localizedError(failure, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay
      open={!suspended} testId="trash-dialog" title={text.moveToTrash} description={text.moveToTrashDescription}
      initialFocus={cancel} onDismiss={pending ? undefined : dismiss}
      restoreFallback={() => {
        if (moved.current || !trigger.isConnected) focusAfterMove();
        else trigger.focus();
      }}
    >
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <p className="break-words text-sm font-medium">{file.originalName}</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6">
        <button type="button" ref={cancel} data-testid="trash-cancel" className="button button-secondary" onClick={dismiss} disabled={pending}>{text.cancel}</button>
        <button type="button" data-testid="trash-confirm" className="button button-danger aria-disabled:cursor-not-allowed aria-disabled:opacity-60" onClick={() => void submit()} aria-disabled={pending} aria-busy={pending}>
          {pending ? text.movingToTrash : text.moveToTrash}
        </button>
      </div>
    </Overlay>
  );
}
