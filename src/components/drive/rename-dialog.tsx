'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, renameFile, type FileItem } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type Props = {
  file: FileItem;
  suspended: boolean;
  trigger: HTMLElement;
  onDismiss: () => void;
  onSessionExpired: () => void;
  onSaved: (file: FileItem) => void;
};

export function RenameDialog({ file, suspended, trigger, onDismiss, onSessionExpired, onSaved }: Props) {
  const { text } = useLocale();
  const [name, setName] = useState(file.originalName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const changed = name !== file.originalName;

  useEffect(() => () => request.current?.abort(), []);

  function dismiss() {
    if (request.current) return;
    if (changed) setConfirmLeave(true);
    else onDismiss();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || confirmLeave) return;
    const nextName = name.trim();
    if (!nextName) {
      setError(text.fileNameRequired);
      input.current?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const updated = await renameFile(file.id, nextName, controller.signal);
      onSaved(updated);
      onDismiss();
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        setError(localizedError(failure, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay open={!suspended} testId="rename-dialog" title={text.renameTitle} description={text.renameDescription} onDismiss={dismiss} initialFocus={input} restoreFocus={trigger}>
      <form onSubmit={submit} className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="space-y-2 p-5 sm:p-6">
          <label htmlFor="rename-file" className="block text-sm font-medium">{text.fileName}</label>
          <input
            ref={input} id="rename-file" data-testid="rename-input" className="field" value={name} maxLength={255}
            onChange={(event) => { setName(event.currentTarget.value); setError(null); }} required
            aria-invalid={Boolean(error)} aria-describedby={error ? 'rename-error' : undefined}
          />
          {error && <p id="rename-error" role="alert" className="text-sm text-red-800">{error}</p>}
          {confirmLeave && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{text.discardRename}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6">
          {confirmLeave ? (
            <>
              <button type="button" className="button button-secondary" onClick={() => { setConfirmLeave(false); input.current?.focus(); }}>{text.keepEditing}</button>
              <button type="button" className="button button-danger" onClick={onDismiss}>{text.discard}</button>
            </>
          ) : (
            <>
              <button type="button" className="button button-secondary" onClick={dismiss} disabled={pending}>{text.cancel}</button>
              <button type="submit" data-testid="rename-save" className="button button-primary" disabled={pending || !changed}>{pending ? text.saving : text.save}</button>
            </>
          )}
        </div>
      </form>
    </Overlay>
  );
}
