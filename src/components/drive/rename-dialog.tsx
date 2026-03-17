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
  return (
    <ItemNameDialog
      initialName={file.originalName} label={text.fileName} requiredMessage={text.fileNameRequired} discardMessage={text.discardRename}
      title={text.renameTitle} description={text.renameDescription} submitLabel={text.save}
      dialogTestId="rename-dialog" inputId="rename-file" inputTestId="rename-input" submitTestId="rename-save"
      suspended={suspended} trigger={trigger} onDismiss={onDismiss} onSessionExpired={onSessionExpired} onSaved={onSaved}
      save={(name, signal) => renameFile(file.id, name, signal)}
    />
  );
}

type NameProps<T> = {
  initialName: string;
  label: string;
  requiredMessage: string;
  discardMessage: string;
  title: string;
  description: string;
  submitLabel: string;
  dialogTestId: string;
  inputId: string;
  inputTestId: string;
  submitTestId: string;
  cancelTestId?: string;
  errorTestId?: string;
  descriptionField?: { label: string; initialValue: string };
  suspended: boolean;
  trigger: HTMLElement | null;
  onDismiss: () => void;
  onSessionExpired: () => void;
  save: (name: string, signal: AbortSignal, description?: string | null) => Promise<T>;
  onSaved: (item: T) => void | Promise<void>;
};

export function ItemNameDialog<T>({
  initialName, label, requiredMessage, discardMessage, title, description, submitLabel,
  dialogTestId, inputId, inputTestId, submitTestId, cancelTestId, errorTestId, descriptionField,
  suspended, trigger, onDismiss, onSessionExpired, save, onSaved,
}: NameProps<T>) {
  const { text } = useLocale();
  const [name, setName] = useState(initialName);
  const initialDescription = descriptionField?.initialValue ?? '';
  const [descriptionText, setDescriptionText] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const descriptionChanged = descriptionText !== initialDescription;
  const changed = name.trim() !== initialName || descriptionChanged;
  const dirty = name !== initialName || descriptionChanged;
  const errorId = `${inputId}-error`;

  useEffect(() => () => request.current?.abort(), []);

  function dismiss() {
    if (request.current) return;
    if (confirmLeave) {
      setConfirmLeave(false);
      input.current?.focus();
    } else if (dirty) setConfirmLeave(true);
    else onDismiss();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || confirmLeave || !changed) return;
    const nextName = name.trim();
    if (!nextName) {
      setError(requiredMessage);
      input.current?.focus();
      return;
    }
    if (descriptionChanged && [...descriptionText].length > 2000) {
      setError(text.descriptionTooLong);
      descriptionInput.current?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const updated = await save(nextName, controller.signal, descriptionChanged ? descriptionText || null : undefined);
      if (controller.signal.aborted) return;
      await onSaved(updated);
      if (!controller.signal.aborted) onDismiss();
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
    <Overlay open={!suspended} testId={dialogTestId} title={title} description={description} onDismiss={dismiss} initialFocus={input} restoreFocus={trigger} restoreFallback={() => document.getElementById('drive-main')?.focus()}>
      <form onSubmit={submit} className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="space-y-2 p-5 sm:p-6">
          <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
          <input
            ref={input} id={inputId} data-testid={inputTestId} className="field" value={name} maxLength={255} readOnly={pending}
            onChange={(event) => { setName(event.currentTarget.value); setError(null); }} required
            aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
          />
          {descriptionField && (
            <div className="space-y-2 pt-2">
              <label htmlFor={`${inputId}-description`} className="block text-sm font-medium">{descriptionField.label}</label>
              <textarea ref={descriptionInput} id={`${inputId}-description`} data-testid="folder-description-input" className="field min-h-24 resize-y" rows={3} maxLength={4000}
                aria-invalid={error === text.descriptionTooLong} aria-describedby={error === text.descriptionTooLong ? errorId : undefined}
                value={descriptionText} readOnly={pending} onChange={(event) => { setDescriptionText(event.currentTarget.value); setError(null); }} />
            </div>
          )}
          {error && <p id={errorId} data-testid={errorTestId} role="alert" className="text-sm text-red-800">{error}</p>}
          {confirmLeave && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{discardMessage}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6">
          {confirmLeave ? (
            <>
              <button type="button" className="button button-secondary" onClick={() => { setConfirmLeave(false); input.current?.focus(); }}>{text.keepEditing}</button>
              <button type="button" className="button button-danger" onClick={onDismiss}>{text.discard}</button>
            </>
          ) : (
            <>
              <button type="button" data-testid={cancelTestId} className="button button-secondary" onClick={dismiss} disabled={pending}>{text.cancel}</button>
              <button type="submit" data-testid={submitTestId} className="button button-primary" disabled={pending || !changed}>{pending ? text.saving : submitLabel}</button>
            </>
          )}
        </div>
      </form>
    </Overlay>
  );
}
