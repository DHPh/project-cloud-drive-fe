'use client';

import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';
import { ApiError, uploadFile } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type UploadState = 'queued' | 'uploading' | 'complete' | 'failed' | 'unknown';
type UploadItem = { id: number; file: File; status: UploadState; percent?: number; detail?: string };

type Props = {
  folder: string;
  suspended: boolean;
  trigger: HTMLElement | null;
  onDismiss: () => void;
  onSessionExpired: () => void;
  onUploaded: () => void;
  onRefresh: () => Promise<boolean>;
};

export function UploadDialog({ folder, suspended, trigger, onDismiss, onSessionExpired, onUploaded, onRefresh }: Props) {
  const { text } = useLocale();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');
  const nextId = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const batch = useRef<AbortController | null>(null);
  const picker = useRef<HTMLButtonElement>(null);

  const statusLabel: Record<UploadState, string> = {
    queued: text.queued, uploading: text.uploading, complete: text.uploaded, failed: text.failed, unknown: text.unknown,
  };
  const hasQueued = items.some((item) => item.status === 'queued');
  const hasUnknown = items.some((item) => item.status === 'unknown');

  useEffect(() => {
    const blockExternalDrop = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', blockExternalDrop);
    window.addEventListener('drop', blockExternalDrop);
    return () => {
      batch.current?.abort();
      window.removeEventListener('dragover', blockExternalDrop);
      window.removeEventListener('drop', blockExternalDrop);
    };
  }, []);

  function addFiles(files: FileList) {
    const selected = Array.from(files, (file): UploadItem => ({ id: ++nextId.current, file, status: 'queued' }));
    setItems((current) => [...current, ...selected]);
    setConfirmLeave(false);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) addFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!batch.current && event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  function update(id: number, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function dismiss() {
    if (batch.current) return;
    if (items.some((item) => item.status === 'queued' || item.status === 'failed')) setConfirmLeave(true);
    else onDismiss();
  }

  async function send(selected: UploadItem[]) {
    if (batch.current || selected.length === 0 || confirmLeave) return;
    const controller = new AbortController();
    batch.current = controller;
    setPending(true);
    setRefreshStatus('');
    try {
      for (const item of selected) {
        if (controller.signal.aborted) break;
        update(item.id, { status: 'uploading', percent: undefined, detail: undefined });
        try {
          await uploadFile(item.file, folder, (percent) => update(item.id, { percent }), controller.signal);
          update(item.id, { status: 'complete', percent: 100 });
          onUploaded();
        } catch (error) {
          if (controller.signal.aborted) break;
          if (error instanceof ApiError && error.status === 401) {
            update(item.id, { status: 'failed', detail: text.uploadInterrupted });
            onSessionExpired();
            break;
          }
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.code !== 'UNEXPECTED_RESPONSE') {
            update(item.id, { status: 'failed', detail: localizedError(error, text) });
          } else {
            update(item.id, { status: 'unknown', detail: text.uploadUnknown });
          }
        }
      }
    } finally {
      batch.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay open={!suspended} testId="upload-dialog" title={text.uploadTitle} description={text.uploadDescription} onDismiss={pending ? undefined : dismiss} initialFocus={picker} restoreFocus={trigger}>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
        <div
          onDragOver={(event) => { event.preventDefault(); if (!pending) setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={handleDrop}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center ${dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50'}`}
        >
          <ArrowUpTrayIcon aria-hidden="true" className="h-8 w-8 text-primary-700" />
          <input ref={input} data-testid="upload-input" type="file" multiple hidden aria-label={text.chooseFiles} onChange={handleInput} disabled={pending} />
          <button ref={picker} type="button" className="button button-secondary" disabled={pending} onClick={() => input.current?.click()}>{text.chooseFiles}</button>
          <p className="text-sm text-gray-600">{text.dropFiles}</p>
        </div>
        {items.length > 0 && (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 px-3" aria-live="polite">
            {items.map((item) => (
              <li key={item.id} data-testid="upload-item" data-status={item.status} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={item.file.name}>{item.file.name}</p>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {item.status === 'uploading' && item.percent === 100 ? text.processing : statusLabel[item.status]}
                      {item.status === 'uploading' && item.percent !== undefined ? ` · ${item.percent}%` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {item.status === 'failed' && (
                      <button type="button" data-testid="upload-retry" aria-label={`${text.retryFile}: ${item.file.name}`} disabled={pending} onClick={() => void send([item])} className="button button-secondary px-2">{text.retry}</button>
                    )}
                    {item.status !== 'uploading' && item.status !== 'complete' && (
                      <button type="button" data-testid="upload-remove" aria-label={`${text.removeFile}: ${item.file.name}`} disabled={pending} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} className="button button-secondary px-2">{text.removeFile}</button>
                    )}
                  </div>
                </div>
                {item.status === 'uploading' && (
                  <progress data-testid="upload-progress" aria-label={`${text.uploading}: ${item.file.name}`} value={item.percent} max={100} className="mt-2 h-2 w-full accent-primary-600" />
                )}
                {item.detail && <p className="mt-2 text-sm text-red-800">{item.detail}</p>}
              </li>
            ))}
          </ul>
        )}
        {hasUnknown && <button type="button" className="button button-secondary" disabled={pending} onClick={() => void onRefresh().then((ok) => setRefreshStatus(ok ? text.refreshedList : text.requestFailed))}>{text.refreshList}</button>}
        {refreshStatus && <p role="status" className="text-sm text-gray-700">{refreshStatus}</p>}
        {confirmLeave && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{text.discardUpload}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6">
        {confirmLeave ? (
          <>
            <button type="button" className="button button-secondary" onClick={() => { setConfirmLeave(false); picker.current?.focus(); }}>{text.keepEditing}</button>
            <button type="button" className="button button-danger" onClick={onDismiss}>{text.discard}</button>
          </>
        ) : (
          <>
            <button type="button" data-testid="upload-close" className="button button-secondary" onClick={dismiss} disabled={pending}>{text.close}</button>
            {hasQueued && <button type="button" data-testid="upload-submit" className="button button-primary" disabled={pending} onClick={() => void send(items.filter((item) => item.status === 'queued'))}>{pending ? text.uploading : text.uploadSelected}</button>}
          </>
        )}
      </div>
    </Overlay>
  );
}
