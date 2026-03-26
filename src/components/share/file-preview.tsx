'use client';

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
  const [renderedPage, setRenderedPage] = useState(0);
  const [pageText, setPageText] = useState('');
  const [failure, setFailure] = useState(false);
  const pageLabel = locale === 'vi' ? `Trang ${page}` : `Page ${page}`;

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
      const viewport = selected.getViewport({ scale: Math.min(1.6, 1200 / original.width, 1600 / original.height) });
      target.width = viewport.width;
      target.height = viewport.height;
      render = selected.render({ canvas: target, viewport });
      await render.promise;
      if (active) setRenderedPage(page);
      const content = await selected.getTextContent();
      if (active) setPageText(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
    })().catch(() => { if (active) setFailure(true); });
    return () => { active = false; render?.cancel(); };
  }, [document, page]);

  if (failure) return <p role="alert">{locale === 'vi' ? 'Không thể hiển thị PDF. Bạn có thể tải tệp xuống.' : 'The PDF could not be displayed. You can download it.'}</p>;
  return (
    <div className="space-y-3">
      {document && <div className="flex flex-wrap items-center gap-2">
        <button className="button button-secondary min-h-11" type="button" disabled={page === 1} onClick={() => { setPageText(''); setPage(page - 1); }}>{locale === 'vi' ? 'Trang trước' : 'Previous page'}</button>
        <span aria-live="polite">{pageLabel} / {document.numPages}</span>
        <button className="button button-secondary min-h-11" type="button" disabled={page === document.numPages} onClick={() => { setPageText(''); setPage(page + 1); }}>{locale === 'vi' ? 'Trang sau' : 'Next page'}</button>
      </div>}
      {renderedPage !== page && <p role="status">{text.loading}</p>}
      <canvas ref={canvas} hidden={renderedPage !== page} role="img" aria-label={`${name}, ${pageLabel}`} data-testid="file-preview-pdf" className="h-auto max-w-full" />
      {pageText && <details><summary>{locale === 'vi' ? 'Văn bản của trang' : 'Page text'}</summary><p className="whitespace-pre-wrap break-words">{pageText}</p></details>}
    </div>
  );
}

export function FilePreview({ fileId, name, onExpired }: { fileId: string; name: string; onExpired: () => void }) {
  const { locale, text } = useLocale();
  const [staged, setStaged] = useState<Content>();
  const [loadError, setLoadError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
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
    return <div className="space-y-2">
      <p role="alert">{hint}</p>
      {status !== 413 && status !== 415 && status !== 404 && <button type="button" className="button button-secondary min-h-11" onClick={() => { setLoadError(undefined); setAttempt(attempt + 1); }}>{text.retry}</button>}
    </div>;
  }
  if (!staged) return <p role="status">{text.loading}</p>;
  if (staged.type === 'text') return <pre data-testid="file-preview-text" className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-sm">{staged.text || (vi ? 'Tệp trống.' : 'This file is empty.')}</pre>;
  if (staged.type === 'pdf') return <PdfPreview blob={staged.blob} name={name} />;
  // eslint-disable-next-line @next/next/no-img-element -- An authenticated local blob has no optimization URL.
  return <img data-testid="file-preview-image" src={staged.url} alt={name} className="h-auto max-w-full" />;
}
