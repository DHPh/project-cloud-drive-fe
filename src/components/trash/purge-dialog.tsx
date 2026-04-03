'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, emptyTrash, purgeTrashItem, type TrashItem } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

export type PurgeIntent =
  | { kind: 'single'; item: TrashItem; trigger: HTMLElement }
  | { kind: 'empty'; requestId: string; trigger: HTMLElement };

type Props = {
  intent: PurgeIntent;
  suspended: boolean;
  onDismiss: () => void;
  onExpired: () => void;
  onAccepted: (count: number) => void;
  onRecheck: () => void;
  focusAfterClose: () => void;
};

export function PurgeDialog({ intent, suspended, onDismiss, onExpired, onAccepted, onRecheck, focusAfterClose }: Props) {
  const { text } = useLocale();
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const accepted = useRef(false);
  const title = intent.kind === 'empty' ? text.emptyTrash : text.deletePermanently;
  const description = intent.kind === 'empty' ? text.emptyTrashDescription
    : intent.item.kind === 'folder' ? text.permanentFolderDescription : text.permanentFileDescription;

  useEffect(() => () => request.current?.abort(), []);

  function dismiss() {
    if (!request.current) onDismiss();
  }

  async function confirm() {
    if (request.current || accepted.current || changed) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const result = intent.kind === 'empty'
        ? await emptyTrash(intent.requestId, controller.signal)
        : await purgeTrashItem(intent.item, controller.signal);
      if (controller.signal.aborted) return;
      accepted.current = true;
      onAccepted(result.acceptedCount);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setError(localizedError(failure, text));
      if (failure instanceof ApiError && failure.status === 409) setChanged(true);
      if (!(failure instanceof ApiError) || failure.status === 409 || failure.status >= 500) onRecheck();
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay
      open={!suspended} testId="trash-purge-dialog" title={title} description={description}
      initialFocus={cancel} onDismiss={pending ? undefined : dismiss}
      restoreFallback={() => {
        if (accepted.current || !intent.trigger.isConnected) focusAfterClose();
        else intent.trigger.focus();
      }}
    >
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        {intent.kind === 'single' && <p className="[overflow-wrap:anywhere] text-sm font-medium">{intent.item.kind === 'folder' ? intent.item.name : intent.item.originalName}</p>}
        {error && <p data-testid="trash-purge-error" role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
        <button type="button" ref={cancel} data-testid="trash-purge-cancel" className="button button-secondary min-h-11" onClick={dismiss} disabled={pending}>{text.cancel}</button>
        <button type="button" data-testid="trash-purge-confirm" className="button button-danger min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-60" onClick={() => void confirm()} aria-disabled={pending || changed} aria-busy={pending}>
          {pending ? text.submittingPurge : title}
        </button>
      </div>
    </Overlay>
  );
}
