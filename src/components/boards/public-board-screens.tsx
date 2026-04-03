'use client';

import { ArrowDownTrayIcon, ArrowLeftIcon, ArrowRightIcon, DocumentIcon, EyeIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type ReactNode, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import type { components } from '@/lib/api-schema';
import { getPublicBoard, getPublicBoardPreview, listPublicBoards, publicBoardDownloadUrl } from '@/lib/board-api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { BrandIcon } from '../brand';
import { LanguageSwitch } from '../language-switch';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';
import { BoardPagination } from './board-pagination';

const copy = {
  vi: {
    explore: 'Khám phá',
    emptyExplore: 'Chưa có bảng trong Khám phá.',
    unavailable: 'Bảng này hiện không khả dụng.',
    backToExplore: 'Về Khám phá',
    publishedFiles: 'Tệp đã công bố',
    emptyBoard: 'Bảng này chưa có tệp công bố.',
    preview: 'Xem trước',
    previewDescription: 'Đoạn văn bản đã công bố.',
    previewUnavailable: 'Bản xem trước hiện không khả dụng.',
    truncated: 'Chỉ hiển thị phần đầu của tệp.',
  },
  en: {
    explore: 'Explore',
    emptyExplore: 'There are no boards in Explore yet.',
    unavailable: 'This board is currently unavailable.',
    backToExplore: 'Back to Explore',
    publishedFiles: 'Published files',
    emptyBoard: 'This board has no published files yet.',
    preview: 'Preview',
    previewDescription: 'Published text excerpt.',
    previewUnavailable: 'This preview is currently unavailable.',
    truncated: 'Showing the beginning of the file.',
  },
};

function PublicBoardLayout({ explore, children }: { explore?: boolean; children: ReactNode }) {
  const { locale, text } = useLocale();
  return (
    <div className="safe-top safe-bottom min-h-dvh bg-slate-50 dark:bg-slate-950">
      <a href="#public-board-main" className="sr-only z-40 focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded-md focus:bg-white focus:p-3 focus:text-slate-900">{text.skip}</a>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <BrandIcon />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">Cloud Drive</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:gap-3">
            <nav aria-label={text.navigation} className="flex">
              <Link href="/explore" prefetch={false} aria-current={explore ? 'page' : undefined} className={`button min-h-11 px-2 sm:px-3 ${explore ? 'bg-primary-100 text-primary-900 dark:bg-primary-500/20 dark:text-primary-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{copy[locale].explore}</Link>
              <Link href="/drive" prefetch={false} className="button min-h-11 px-2 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:px-3">{text.myDrive}</Link>
            </nav>
            <LanguageSwitch />
          </div>
        </div>
      </header>
      <main id="public-board-main" tabIndex={-1} className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:py-8">{children}</main>
    </div>
  );
}

export function ExploreBoardsScreen({ page }: { page: number }) {
  const { locale, text } = useLocale();
  const labels = copy[locale];
  const query = useQuery({
    queryKey: ['public-boards', page],
    queryFn: ({ signal }) => listPublicBoards(page, signal),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const checking = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const data = !query.error && !checking ? query.data : undefined;

  return (
    <PublicBoardLayout explore>
      <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
        <GlobeAltIcon aria-hidden="true" className="h-6 w-6 text-primary-800" />{labels.explore}
      </h1>
      {checking && <p role="status" className="panel p-4 text-sm text-gray-600">{text.loading}</p>}
      {query.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>{localizedError(query.error, text)}</p>
          <button type="button" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
        </div>
      )}
      {data?.data.items.length === 0 && <p data-testid="public-boards-empty" className="panel p-4 text-sm text-gray-600">{labels.emptyExplore}</p>}
      {data && data.data.items.length > 0 && (
        <ul aria-label={labels.explore} aria-busy={query.isFetching} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.items.map((board) => (
            <li key={board.publicId} data-testid="public-board-card" data-public-id={board.publicId} className="panel min-w-0 p-4">
              <h2 className="font-semibold text-gray-900 [overflow-wrap:anywhere]">
                <Link href={`/public/boards/${encodeURIComponent(board.publicId)}`} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 rounded-md text-primary-800 hover:underline">
                  <span>{board.title}</span><ArrowRightIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
                </Link>
              </h2>
              {board.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-gray-600 [overflow-wrap:anywhere]">{board.description}</p>}
            </li>
          ))}
        </ul>
      )}
      {data && <BoardPagination path="/explore" page={page} totalPages={data.pagination.totalPages} />}
    </PublicBoardLayout>
  );
}

export function PublicBoardScreen({ publicId }: { publicId: string }) {
  const { locale, text } = useLocale();
  const labels = copy[locale];
  const query = useQuery({
    queryKey: ['public-board', publicId],
    queryFn: ({ signal }) => getPublicBoard(publicId, signal),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const checking = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const unavailable = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
  const board = !query.error && !checking ? query.data : undefined;

  return (
    <PublicBoardLayout>
      <Link href="/explore" prefetch={false} className="button min-h-11 w-fit px-2 text-primary-800 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/15">
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />{labels.backToExplore}
      </Link>
      {checking && <p role="status" className="panel p-4 text-sm text-slate-600 dark:text-slate-400">{text.loading}</p>}
      {query.error && (
        <div data-testid="public-board-error" role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <h1 className="text-base font-semibold">{unavailable ? labels.unavailable : localizedError(query.error, text)}</h1>
          {!unavailable && <button type="button" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>}
        </div>
      )}
      {board && <PublicBoardContent key={board.publicId} board={board} />}
    </PublicBoardLayout>
  );
}

function PublicBoardContent({ board }: { board: components['schemas']['PublicBoardDetail'] }) {
  const { locale, text } = useLocale();
  const labels = copy[locale];
  const heading = useRef<HTMLHeadingElement>(null);

  return (
    <>
      <header className="panel p-4 sm:p-6">
        <h1 ref={heading} tabIndex={-1} data-testid="public-board-heading" className="w-fit rounded-sm text-2xl font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{board.title}</h1>
        {board.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{board.description}</p>}
      </header>
      <section aria-labelledby="public-board-files" className="space-y-3">
        <h2 id="public-board-files" className="text-lg font-semibold text-slate-900 dark:text-slate-100">{labels.publishedFiles}</h2>
        {board.items.length === 0 ? (
          <p data-testid="public-board-empty" className="panel p-4 text-sm text-slate-600 dark:text-slate-400">{labels.emptyBoard}</p>
        ) : (
          <ul className="space-y-2">
            {board.items.map((item) => (
              <li key={item.id} data-testid="public-board-item" data-item-id={item.id} className="panel grid min-w-0 items-start gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-900 dark:bg-primary-900/60 dark:text-primary-200"><DocumentIcon aria-hidden="true" className="h-5 w-5" /></span>
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.originalName}</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{readableSize(item.size, locale)}{item.mimeType && <> <span aria-hidden="true">·</span> {item.mimeType}</>}</p>
                  </div>
                </div>
                {(item.canPreview || item.allowDownload) && <div className="flex flex-wrap items-center gap-2">
                  {item.canPreview && (
                    <PublicBoardPreviewAction publicId={board.publicId} item={item} restoreFallback={() => heading.current?.focus()} />
                  )}
                  {item.allowDownload && (
                    <a data-testid="public-board-download" href={publicBoardDownloadUrl(board.publicId, item.id)} download={item.originalName} aria-label={`${text.download}: ${item.originalName}`} className="button button-secondary min-h-11">
                      <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />{text.download}
                    </a>
                  )}
                </div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function PublicBoardPreviewAction({ publicId, item, restoreFallback }: {
  publicId: string;
  item: components['schemas']['PublicBoardItem'];
  restoreFallback: () => void;
}) {
  const { locale } = useLocale();
  const label = copy[locale].preview;
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button type="button" data-testid="public-board-preview-open" aria-label={`${label}: ${item.originalName}`} className="button button-secondary min-h-11" onClick={(event) => setTrigger(event.currentTarget)}>
        <EyeIcon aria-hidden="true" className="h-4 w-4" />{label}
      </button>
      {trigger && <PublicBoardPreview publicId={publicId} item={item} trigger={trigger} onDismiss={() => setTrigger(null)} restoreFallback={restoreFallback} />}
    </>
  );
}

function PublicBoardPreview({ publicId, item, trigger, onDismiss, restoreFallback }: {
  publicId: string;
  item: components['schemas']['PublicBoardItem'];
  trigger: HTMLButtonElement;
  onDismiss: () => void;
  restoreFallback: () => void;
}) {
  const { locale, text } = useLocale();
  const labels = copy[locale];
  const close = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey: ['public-board-preview', publicId, item.id],
    queryFn: ({ signal }) => getPublicBoardPreview(publicId, item.id, signal),
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const unavailable = query.error instanceof ApiError && query.error.status === 404;
  const excerpt = !query.isFetching && !query.error ? query.data : undefined;

  return (
    <Overlay testId="public-board-preview-dialog" title={labels.preview} description={labels.previewDescription} initialFocus={close} onDismiss={onDismiss} restoreFocus={trigger} restoreFallback={restoreFallback}>
      <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4 text-sm sm:px-6">
        <p className="font-medium text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{item.originalName}</p>
        {query.isFetching && <p role="status" className="text-slate-600 dark:text-slate-400">{text.loading}</p>}
        {query.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950/50 dark:text-red-200">
          <p>{unavailable ? labels.previewUnavailable : localizedError(query.error, text)}</p>
          {!unavailable && <button type="button" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>}
        </div>}
        {excerpt && <>
          <pre data-testid="public-board-preview" className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 font-mono text-sm leading-relaxed text-slate-900 [overflow-wrap:anywhere] dark:bg-slate-800 dark:text-slate-100">{excerpt.text}</pre>
          {excerpt.truncated && <p className="text-slate-600 dark:text-slate-400">{labels.truncated}</p>}
        </>}
      </div>
      <footer className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:px-6">
        <button ref={close} type="button" data-testid="public-board-preview-close" className="button button-secondary min-h-11" onClick={onDismiss}>{text.close}</button>
      </footer>
    </Overlay>
  );
}
