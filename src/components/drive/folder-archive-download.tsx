'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import { ApiError, downloadFolderArchive, type FolderSummary } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { useLocale } from '../providers';

function archiveName(disposition: string | null, fallback: string) {
  const encodedName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encodedName) return fallback;
  try { return decodeURIComponent(encodedName); } catch { return fallback; }
}

function saveArchive(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function FolderArchiveDownload({ folder, onExpired }: { folder: FolderSummary; onExpired: () => void }) {
  const { text } = useLocale();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    const current = request.current;
    request.current = null;
    current?.abort();
  }, []);

  async function download() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const { blob, disposition } = await downloadFolderArchive(folder.id, controller.signal);
      if (request.current !== controller || controller.signal.aborted) return;
      saveArchive(blob, archiveName(disposition, `${folder.name}.zip`));
      setStatus(text.zipReady);
    } catch (failure) {
      if (request.current !== controller) return;
      if (controller.signal.aborted) setStatus(text.zipCanceled);
      else if (failure instanceof ApiError) {
        if (failure.status === 401) onExpired();
        else setError(localizedError(failure, text));
      } else setError(text.archiveDownloadFailed);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function cancel() {
    request.current?.abort();
    setStatus(text.zipCanceled);
    opener.current?.focus();
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button ref={opener} type="button" data-testid="folder-zip-download" className="button button-secondary min-h-11 aria-disabled:opacity-60" aria-disabled={pending} aria-busy={pending} onClick={() => void download()}>
          <ArrowDownTrayIcon aria-hidden="true" className="h-5 w-5" />{pending ? text.preparingZip : text.downloadZip}
        </button>
        {pending && <button type="button" data-testid="folder-zip-cancel" className="button button-secondary min-h-11" onClick={cancel}>{text.cancelZip}</button>}
      </div>
      <p role="status" data-testid="folder-zip-status" className={status ? 'text-sm text-gray-700' : 'sr-only'}>{status}</p>
      {error && <p role="alert" data-testid="folder-zip-error" className="max-w-md text-sm text-red-800">{error}</p>}
    </div>
  );
}
