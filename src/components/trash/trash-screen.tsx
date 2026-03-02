'use client';

import { ArrowUturnLeftIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, listTrash, restoreFile, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { pageNumber, trashHref } from '@/lib/routes';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { useLocale } from '../providers';

export function TrashScreen({ initialUser }: { initialUser: User }) {
  const params = useSearchParams();
  const page = pageNumber(params.get('page'));
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, trashHref(page));
  const { locale, text } = useLocale();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextFocus = useRef<{ page: number; id: string | null } | null>(null);

  const queryKey = ['trash', user.id, page] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listTrash(page, signal),
    enabled: !expired,
    placeholderData: keepPreviousData,
  });
  const { data, isPlaceholderData } = query;
  const items = data?.data.items ?? [];
  const lastPage = Math.max(1, data?.pagination.totalPages ?? 1);
  const shouldMovePage = Boolean(data && !isPlaceholderData && page > lastPage);
  const error = query.error && (!(query.error instanceof ApiError) || query.error.status !== 401) ? query.error : null;

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) expire();
  }, [query.error, expire]);

  useEffect(() => {
    if (shouldMovePage) window.history.replaceState(null, '', trashHref(lastPage));
  }, [shouldMovePage, lastPage]);

  useEffect(() => {
    const target = nextFocus.current;
    if (!target || restoring || expired || page !== target.page) return;
    nextFocus.current = null;
    const button = target.id ? document.getElementById(`trash-restore-${target.id}`) : null;
    (button ?? heading.current)?.focus();
  }, [page, data, restoring, expired]);

  async function restore(fileId: string) {
    if (request.current || isPlaceholderData || expired) return;
    const controller = new AbortController();
    request.current = controller;
    setRestoring(fileId);
    setRestoreError(null);
    setNotice('');
    const originalFolderId = items.find((item) => item.id === fileId)?.folderId;
    try {
      const result = await restoreFile(fileId, controller.signal);
      if (controller.signal.aborted) return;
      const current = queryClient.getQueryData<typeof data>(queryKey);
      if (current) {
        const index = current.data.items.findIndex((item) => item.id === result.id);
        const updatedItems = current.data.items.filter((item) => item.id !== result.id);
        const total = Math.max(0, current.pagination.total - (index >= 0 ? 1 : 0));
        const totalPages = Math.ceil(total / current.pagination.limit);
        if (window.location.pathname === '/trash' && pageNumber(new URLSearchParams(window.location.search).get('page')) === page) {
          const neighbor = index < 0 ? undefined : updatedItems[index] ?? updatedItems[index - 1];
          nextFocus.current = { page: Math.min(page, Math.max(1, totalPages)), id: neighbor?.id ?? null };
        }
        queryClient.setQueryData(queryKey, { ...current, data: { ...current.data, items: updatedItems }, pagination: { ...current.pagination, total, totalPages } });
      }
      void queryClient.invalidateQueries({ queryKey: ['trash', user.id] });
      void queryClient.invalidateQueries({ queryKey: ['drive', user.id] });
      void queryClient.invalidateQueries({ queryKey: ['file', user.id, fileId] });
      void queryClient.invalidateQueries({ queryKey: ['file-shares', user.id, fileId] });
      setNotice(originalFolderId && result.folderId === null ? text.fileRestoredToRoot : text.fileRestored);
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) expire();
        else setRestoreError({ id: fileId, message: localizedError(failure, text) });
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setRestoring(null);
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const totalPages = data?.pagination.totalPages ?? 0;

  return (
    <>
      <DriveLayout user={user} signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <h1 id="trash-heading" ref={heading} tabIndex={-1} className="flex w-fit items-center gap-2 rounded-md px-1 py-1 text-lg font-semibold text-gray-900">
            <TrashIcon aria-hidden="true" className="h-6 w-6 text-gray-600" />{text.trash}
          </h1>
          <p role="status" data-testid="trash-status" className={notice ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900' : 'sr-only'}>{notice || (query.isFetching ? text.updating : '')}</p>
          {error && (
            <div data-testid="trash-error" role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
              <p>{localizedError(error, text)}</p>
              <button data-testid="trash-retry" type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {(query.isPending || shouldMovePage) && !expired && !error && (
            <div data-testid="trash-loading" role="status" aria-busy="true" className="space-y-2">
              <span className="sr-only">{text.loading}</span>
              {Array.from({ length: 3 }, (_, index) => <div key={index} aria-hidden="true" className="h-[4.5rem] rounded-lg border border-gray-100 bg-gray-100 motion-safe:animate-pulse" />)}
            </div>
          )}
          {data && !shouldMovePage && items.length === 0 && !isPlaceholderData && !error && (
            <div data-testid="trash-empty" className="flex flex-col items-center gap-3 py-14 text-center sm:py-20">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-100 sm:h-40 sm:w-40"><TrashIcon aria-hidden="true" className="h-16 w-16 text-gray-400" /></div>
              <h2 className="mt-2 text-lg font-semibold">{text.noTrashItems}</h2>
              <p className="text-sm text-gray-600">{text.noTrashDescription}</p>
              <Link href="/drive" prefetch={false} className="button button-secondary">{text.backToDrive}</Link>
            </div>
          )}
          {items.length > 0 && (
            <ul aria-label={text.trash} aria-busy={query.isFetching} className="space-y-2">
              {items.map((item) => (
                <li key={item.id} data-testid="trash-item" data-item-id={item.id} className="panel grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-2 py-2.5 sm:gap-x-3 sm:px-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-100 text-primary-800 sm:h-10 sm:w-10"><DocumentIcon aria-hidden="true" className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium [overflow-wrap:anywhere] sm:line-clamp-2" title={item.originalName}>{item.originalName}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-gray-600">
                      {readableSize(item.size, locale)} <span aria-hidden="true">·</span> <span className="sr-only sm:not-sr-only">{text.trashedOn} </span><time dateTime={item.trashedAt}>{dateFormat.format(new Date(item.trashedAt))}</time>
                    </p>
                  </div>
                  <button
                    id={`trash-restore-${item.id}`} data-testid="trash-restore" type="button" className="button button-secondary min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                    aria-label={`${restoring === item.id ? text.restoring : text.restore}: ${item.originalName}`}
                    aria-busy={restoring === item.id} aria-disabled={Boolean(restoring || isPlaceholderData || expired)} onClick={() => void restore(item.id)}
                  >
                    <ArrowUturnLeftIcon aria-hidden="true" className="h-4 w-4" />
                    {restoring === item.id ? text.restoring : text.restore}
                  </button>
                  {restoreError?.id === item.id && <p role="alert" className="col-span-3 pt-2 text-sm text-red-800">{restoreError.message}</p>}
                </li>
              ))}
            </ul>
          )}
          {data && totalPages > 1 && !shouldMovePage && (
            <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
              <p className="text-gray-600">{text.page} {page} / {totalPages} · {new Intl.NumberFormat(locale).format(data.pagination.total)} {text.items}</p>
              <div className="flex gap-1">
                {page > 1 && <Link href={trashHref(page - 1)} prefetch={false} data-testid="trash-pagination-prev" aria-label={text.previousPage} className="icon-button"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
                {page < totalPages && <Link href={trashHref(page + 1)} prefetch={false} data-testid="trash-pagination-next" aria-label={text.nextPage} className="icon-button"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
              </div>
            </nav>
          )}
        </div>
      </DriveLayout>
      {sessionDialog}
    </>
  );
}
