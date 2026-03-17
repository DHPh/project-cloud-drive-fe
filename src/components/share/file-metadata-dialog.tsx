'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, updateFile, type FileItem } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type Props = {
  file: FileItem;
  trigger: HTMLElement;
  suspended: boolean;
  onDismiss: () => void;
  onExpired: () => void;
  onSaved: (file: FileItem) => Promise<void>;
};

export function FileMetadataDialog({ file, trigger, suspended, onDismiss, onExpired, onSaved }: Props) {
  const { text } = useLocale();
  const originalDescription = file.description ?? '';
  const [description, setDescription] = useState(originalDescription);
  const [tags, setTags] = useState(file.tags);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);

  const descriptionChanged = description !== originalDescription;
  const tagsChanged = tags.length !== file.tags.length || tags.some((tag, index) => tag !== file.tags[index]);
  const pendingTag = tagInput.trim();
  const changed = descriptionChanged || tagsChanged || Boolean(pendingTag);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (discard) stayRef.current?.focus(); }, [discard]);

  function keepEditing() {
    setDiscard(false);
    descriptionRef.current?.focus();
  }

  function dismiss() {
    if (request.current) return;
    if (discard) keepEditing();
    else if (changed) setDiscard(true);
    else onDismiss();
  }

  function includePendingTag() {
    if (!pendingTag) return tags;
    if ([...pendingTag].length > 64) {
      setTagError(text.fileTagTooLong);
      tagRef.current?.focus();
      return null;
    }
    if (tags.includes(pendingTag) || tags.length >= 20) {
      setTagError(tags.includes(pendingTag) ? text.fileTagDuplicate : text.fileTagLimitReached);
      tagRef.current?.focus();
      return null;
    }
    return [...tags, pendingTag];
  }

  function addTag() {
    if (!pendingTag || request.current || discard) return;
    const nextTags = includePendingTag();
    if (!nextTags) return;
    setTags(nextTags);
    setTagInput('');
    setTagError(null);
    setError(null);
    tagRef.current?.focus();
  }

  function removeTag(tag: string) {
    if (request.current || discard) return;
    setTags((current) => current.filter((value) => value !== tag));
    setTagError(null);
    setError(null);
    tagRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || discard || !changed) return;
    if (descriptionChanged && [...description].length > 2000) {
      setError(text.descriptionTooLong);
      descriptionRef.current?.focus();
      return;
    }
    const selectedTags = includePendingTag();
    if (!selectedTags) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const updated = await updateFile(file.id, {
        ...(descriptionChanged ? { description: description || null } : {}),
        ...(tagsChanged || pendingTag ? { tags: selectedTags } : {}),
      }, controller.signal);
      if (controller.signal.aborted) return;
      await onSaved(updated);
      if (!controller.signal.aborted) onDismiss();
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setError(localizedError(failure, text));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay open={!suspended} testId="file-metadata-dialog" title={text.editFileMetadata} description={text.editFileMetadataDescription}
      initialFocus={descriptionRef} restoreFocus={trigger} onDismiss={pending ? undefined : dismiss} restoreFallback={() => document.getElementById('file-main')?.focus()}>
      <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-col">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <div>
            <label htmlFor="file-metadata-description" className="mb-1 block text-sm font-medium">{text.fileDescription}</label>
            <textarea ref={descriptionRef} id="file-metadata-description" data-testid="file-metadata-description" rows={4} maxLength={4000}
              aria-invalid={error === text.descriptionTooLong} aria-describedby={error === text.descriptionTooLong ? 'file-metadata-error' : undefined}
              className="field min-h-24 resize-y" value={description} readOnly={pending || discard}
              onChange={(event) => { setDescription(event.currentTarget.value); setError(null); }} />
          </div>
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-sm font-medium">{text.fileTags}</legend>
            {tags.length > 0 && (
              <ul className="flex min-w-0 flex-wrap gap-2">
                {tags.map((tag) => (
                  <li key={tag} data-testid="file-metadata-tag" className="flex min-w-0 max-w-full items-center gap-1 rounded-lg bg-gray-100 pl-2.5 text-sm text-gray-900">
                    <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{tag}</span>
                    <button type="button" data-testid="file-metadata-remove-tag" aria-label={`${text.removeFileTag} ${tag}`} className="icon-button h-11 w-11" disabled={pending || discard} onClick={() => removeTag(tag)}><XMarkIcon aria-hidden="true" className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor="file-metadata-tag-input" className="block text-sm font-medium">{text.fileTagInput}</label>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input ref={tagRef} id="file-metadata-tag-input" data-testid="file-metadata-tag-input" className="field min-w-0 flex-1" maxLength={128}
                value={tagInput} readOnly={pending || discard} autoComplete="off" aria-invalid={Boolean(tagError)} aria-describedby={tagError ? 'file-tag-limits file-tag-error' : 'file-tag-limits'}
                onChange={(event) => { setTagInput(event.currentTarget.value); setTagError(null); setError(null); }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                  event.preventDefault();
                  addTag();
                }} />
              <button type="button" data-testid="file-metadata-tag-add" className="button button-secondary min-h-11" disabled={pending || discard || !pendingTag} onClick={addTag}>{text.addFileTag}</button>
            </div>
            <p id="file-tag-limits" className="text-xs text-gray-600">{text.fileTagLimits}</p>
            {tagError && <p id="file-tag-error" data-testid="file-metadata-tag-error" role="alert" className="text-sm text-red-800">{tagError}</p>}
          </fieldset>
          {error && <p id="file-metadata-error" data-testid="file-metadata-error" role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {discard && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{text.discardFileMetadata}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6">
          {discard ? (
            <>
              <button type="button" ref={stayRef} className="button button-secondary min-h-11" onClick={keepEditing}>{text.keepEditing}</button>
              <button type="button" data-testid="file-metadata-discard" className="button button-danger min-h-11" onClick={onDismiss}>{text.discard}</button>
            </>
          ) : (
            <>
              <button type="button" data-testid="file-metadata-cancel" className="button button-secondary min-h-11" disabled={pending} onClick={dismiss}>{text.cancel}</button>
              <button type="submit" data-testid="file-metadata-save" disabled={pending || !changed} className="button button-primary min-h-11">{pending ? text.saving : text.save}</button>
            </>
          )}
        </div>
      </form>
    </Overlay>
  );
}
