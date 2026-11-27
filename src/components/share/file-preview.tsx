'use client';

import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ApiError, getFilePreview } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { useLocale } from '../providers';

type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'pdf'; blob: Blob };

function PdfPreview({ blob, name }: { blob: Blob; name: string }) {
  const { locale, text } = useLocale();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [renderedPage, setRenderedPage] = useState('');
  const [pageText, setPageText] = useState('');
  const [failure, setFailure] = useState(false);
  const pageLabel = locale === 'vi' ? `Trang ${page}` : `Page ${page}`;
  const renderKey = `${page}:${zoom}`;

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    void (async () => {
      const [pdf, bytes] = await Promise.all([import('pdfjs-dist'), blob.arrayBuffer()]);
      if (!active) return;
      pdf.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      task = pdf.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, enableXfa: false, maxImageSize: 12_000_000 });
      const loaded = await task.promise;
      if (active) setDocument(loaded);
    })().catch(() => { if (active) setFailure(true); });
    return () => { active = false; void task?.destroy().catch(() => undefined); };
  }, [blob]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    const target = canvas.current;
    void (async () => {
      const selected = await document.getPage(page);
      if (!active) return;
      const original = selected.getViewport({ scale: 1 });
      const baseScale = Math.min(1.6, 1200 / original.width, 1600 / original.height);
      const viewport = selected.getViewport({ scale: baseScale * zoom });
      target.width = viewport.width;
      target.height = viewport.height;
      render = selected.render({ canvas: target, viewport });
      await render.promise;
      if (active) setRenderedPage(renderKey);
      const content = await selected.getTextContent();
      if (active) setPageText(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
    })().catch(() => { if (active) setFailure(true); });
    return () => { active = false; render?.cancel(); };
  }, [document, page, renderKey, zoom]);

  if (failure) {
    return (
      <div className="rounded-2xl border border-red-200 bg-danger-soft p-5 text-sm text-danger dark:border-red-900">
        <p role="alert">
          {locale === 'vi' ? 'Không thể hiển thị PDF. Bạn có thể tải tệp xuống.' : 'The PDF could not be displayed. You can download it.'}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-elevated shadow-sm">
      {document && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-rail px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="button button-secondary min-h-9 px-3 text-xs"
              type="button"
              disabled={page === 1}
              onClick={() => { setPageText(''); setPage(page - 1); }}
            >
              {locale === 'vi' ? 'Trang trước' : 'Previous page'}
            </button>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <span>{locale === 'vi' ? 'Trang' : 'Page'}</span>
              <input
                type="number"
                min={1}
                max={document.numPages}
                value={page}
                aria-label={locale === 'vi' ? 'Số trang' : 'Page number'}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (Number.isInteger(next) && next >= 1 && next <= document.numPages) {
                    setPageText('');
                    setPage(next);
                  }
                }}
                className="field min-h-8 w-16 px-2 py-1 text-center text-xs tabular-nums"
              />
              <span aria-live="polite" className="text-ink-muted">/ {document.numPages}</span>
            </label>
            <button
              className="button button-secondary min-h-9 px-3 text-xs"
              type="button"
              disabled={page === document.numPages}
              onClick={() => { setPageText(''); setPage(page + 1); }}
            >
              {locale === 'vi' ? 'Trang sau' : 'Next page'}
            </button>
          </div>
          <select
            aria-label={locale === 'vi' ? 'Thu phóng' : 'Zoom'}
            value={zoom}
            onChange={(event) => setZoom(Number(event.currentTarget.value))}
            className="field min-h-8 w-24 px-2 py-1 text-xs"
          >
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>
        </div>
      )}
      {renderedPage !== renderKey && (
        <p role="status" className="border-b border-line bg-surface-canvas px-4 py-2 text-xs text-ink-muted">
          {text.loading}
        </p>
      )}
      <div className="ux-scroll-contain max-h-[65vh] overflow-auto bg-surface-subtle/70 p-4">
        <canvas
          ref={canvas}
          hidden={renderedPage !== renderKey}
          role="img"
          aria-label={`${name}, ${pageLabel}`}
          data-testid="file-preview-pdf"
          className="mx-auto h-auto max-w-full rounded bg-white shadow-md"
        />
      </div>
      {pageText && (
        <details className="border-t border-line bg-surface-rail px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-ink-secondary hover:text-ink">
            {locale === 'vi' ? 'Văn bản của trang' : 'Page text'}
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-secondary">{pageText}</p>
        </details>
      )}
    </div>
  );
}

export function FilePreview({ fileId, name, onExpired }: { fileId: string; name: string; onExpired: () => void }) {
  const { locale, text } = useLocale();
  const [staged, setStaged] = useState<Content>();
  const [loadError, setLoadError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [copied, setCopied] = useState(false);
  const vi = locale === 'vi';

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void (async () => {
      const response = await getFilePreview(fileId, controller.signal);
      const mimeType = response.headers.get('content-type')?.split(';')[0];
      if (mimeType === 'text/plain') {
        const content = await response.text();
        if (!controller.signal.aborted) setStaged({ type: 'text', text: content });
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (mimeType === 'application/pdf') {
        setStaged({ type: 'pdf', blob });
      } else if (mimeType && ['image/png', 'image/gif', 'image/jpeg', 'image/webp'].includes(mimeType)) {
        url = URL.createObjectURL(blob);
        setStaged({ type: 'image', url });
      } else {
        setLoadError(new ApiError(415, 'PREVIEW_UNSUPPORTED'));
      }
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setLoadError(error);
      if (error instanceof ApiError && error.status === 401) onExpired();
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [attempt, fileId, onExpired]);

  if (loadError) {
    const status = loadError instanceof ApiError ? loadError.status : null;
    const hint = status === 413
      ? (vi ? 'Tệp quá lớn để xem trước.' : 'The file is too large to preview.')
      : status === 415
        ? (vi ? 'Tệp này chưa có chế độ xem trước.' : 'Preview is unavailable for this file.')
        : localizedError(loadError, text);
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface-rail/60 p-6 text-center">
        <p role="alert" className="text-sm font-medium text-ink-secondary">{hint}</p>
        {status !== 413 && status !== 415 && status !== 404 && (
          <button
            type="button"
            className="button button-secondary min-h-10"
            onClick={() => { setLoadError(undefined); setAttempt(attempt + 1); }}
          >
            {text.retry}
          </button>
        )}
      </div>
    );
  }
  if (!staged) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-line bg-surface-rail/60 p-6">
        <p role="status" className="text-sm font-medium text-ink-muted">{text.loading}</p>
      </div>
    );
  }

  if (staged.type === 'text') {
    const lineCount = staged.text ? staged.text.split(/\r?\n/).length : 0;
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-elevated shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-rail px-3.5 py-2">
          <span className="text-xs font-medium text-ink-muted tabular-nums">
            {vi ? `${lineCount} dòng` : `${lineCount} lines`}
          </span>
          <button
            type="button"
            className="button button-secondary min-h-8 px-2.5 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(staged.text).then(() => setCopied(true)).catch(() => undefined);
            }}
          >
            <ClipboardDocumentIcon aria-hidden="true" className="h-4 w-4" />
            {copied ? (vi ? 'Đã chép' : 'Copied') : (vi ? 'Sao chép' : 'Copy')}
          </button>
        </div>
        <pre
          data-testid="file-preview-text"
          className="ux-scroll-contain max-h-[65vh] overflow-auto whitespace-pre-wrap break-words bg-surface-canvas p-4 font-mono text-[13px] leading-relaxed text-ink"
        >
          {staged.text || (vi ? 'Tệp trống.' : 'This file is empty.')}
        </pre>
      </div>
    );
  }

  if (staged.type === 'pdf') return <PdfPreview blob={staged.blob} name={name} />;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-elevated shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-rail px-3.5 py-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-canvas p-0.5">
          <button
            type="button"
            aria-label={vi ? 'Thu nhỏ' : 'Zoom out'}
            className="icon-button h-7 w-7"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <MagnifyingGlassMinusIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-semibold tabular-nums text-ink hover:bg-surface-hover"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label={vi ? 'Phóng to' : 'Zoom in'}
            className="icon-button h-7 w-7"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
          >
            <MagnifyingGlassPlusIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="button button-secondary min-h-8 px-2.5 text-xs"
            onClick={() => setRotate((r) => (r + 90) % 360)}
          >
            <ArrowPathIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {vi ? 'Xoay 90°' : 'Rotate 90°'}
          </button>
          {(zoom !== 1 || rotate !== 0) && (
            <button
              type="button"
              className="button button-secondary min-h-8 px-2.5 text-xs"
              onClick={() => { setZoom(1); setRotate(0); }}
            >
              {vi ? 'Đặt lại' : 'Reset'}
            </button>
          )}
        </div>
      </div>
      <div className="ux-scroll-contain flex min-h-[340px] max-h-[68vh] flex-1 items-center justify-center overflow-auto bg-surface-subtle/70 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- An authenticated local blob has no optimization URL. */}
        <img
          data-testid="file-preview-image"
          src={staged.url}
          alt={name}
          style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transformOrigin: 'center center' }}
          className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md transition-transform duration-150"
        />
      </div>
    </div>
  );
}
