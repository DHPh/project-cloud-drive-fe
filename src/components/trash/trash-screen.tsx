'use client';

import { ArrowUturnLeftIcon, ChevronLeftIcon, ChevronRightIcon, FolderIcon, TrashIcon } from '@heroicons/react/24/outline';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, listFolder, listTrash, restoreFile, restoreFolder, type TrashItem, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { folderIconClasses, getFileIcon } from '@/lib/file-icons';
import { localizedError } from '@/lib/messages';
import { driveHref, pageNumber, trashHref } from '@/lib/routes';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { useLocale } from '../providers';
import { PurgeDialog, type PurgeIntent } from './purge-dialog';

function itemKey(item: TrashItem) {
  return `${item.kind}-${item.id}-${item.trashEventId}`;
}

export function TrashScreen({ initialUser }: { initialUser: User }) {
  const params = useSearchParams();
  const page = pageNumber(params.get('page'));
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, trashHref(page));
  const { locale, text } = useLocale();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ message: string; name: string; destinationId: string | null; renamed: boolean } | null>(null);
  const [purgeIntent, setPurgeIntent] = useState<PurgeIntent | null>(null);
  const [purgeNotice, setPurgeNotice] = useState<number | null>(null);
  const [verifyAfter, setVerifyAfter] = useState(0);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextFocus = useRef<{ page: number; id: string | null } | null>(null);

  const queryKey = ['trash', user.id, page] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listTrash(page, signal),
    enabled: !expired,
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: ({ state }) => {
      const current = state.data?.data;
      if (!current) return false;
      return current.summary.purgingCount + current.summary.retryingCount > 0 ? 2500 : false;
    },
  });
  const { data, isPlaceholderData, dataUpdatedAt, refetch } = query;
  const items = data?.data.items ?? [];
  const summary = data?.data.summary;
  const lastPage = Math.max(1, data?.pagination.totalPages ?? 1);
  const shouldMovePage = Boolean(data && !isPlaceholderData && page > lastPage);
  const error = query.error && (!(query.error instanceof ApiError) || query.error.status !== 401) ? query.error : null;
  const verifying = query.dataUpdatedAt <= verifyAfter || (!query.isFetchedAfterMount && query.isFetching);
  const canAct = Boolean(data && !verifying && !isPlaceholderData && !query.error && !query.isPaused && !expired);
  const destinationId = notice?.destinationId;
  const destinationQuery = useQuery({
    queryKey: ['drive', user.id, destinationId, '', 1],
    queryFn: ({ signal }) => listFolder(destinationId ?? 'root', '', 1, signal),
    enabled: Boolean(destinationId) && !expired,
    staleTime: 0,
  });
  const destinationName = destinationId === null ? text.myDrive : destinationQuery.data?.data.folder?.name;

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) expire();
  }, [query.error, expire]);

  useEffect(() => {
    if (!data || isPlaceholderData || expired || data.data.summary.purgingCount + data.data.summary.retryingCount > 0) return;
    const closestExpiry = data.data.items.reduce((closest, item) => item.deleteAfter === null ? closest : Math.min(closest, Date.parse(item.deleteAfter)), Infinity);
    if (!Number.isFinite(closestExpiry)) return;
    const timer = window.setTimeout(() => void refetch(), Math.min(Math.max(2500, closestExpiry - Date.now()), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [data, dataUpdatedAt, expired, isPlaceholderData, refetch]);

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

  function recheckTrash() {
    const filters = { queryKey: ['trash', user.id] };
    const latestCachedRead = queryClient.getQueryCache().findAll(filters).reduce((latest, entry) => Math.max(latest, entry.state.dataUpdatedAt), 0);
    setVerifyAfter(latestCachedRead);
    void queryClient.cancelQueries(filters).then(() => queryClient.invalidateQueries(filters));
  }

  function afterPurgeAccepted(count: number) {
    recheckTrash();
    setPurgeNotice(count);
    setPurgeIntent(null);
  }

  async function restore(item: TrashItem) {
    if (request.current || !canAct || item.purgeStatus !== 'available') return;
    const controller = new AbortController();
    const key = itemKey(item);
    request.current = controller;
    setRestoring(key);
    setRestoreError(null);
    setNotice(null);
    setPurgeNotice(null);
    const originalParent = item.kind === 'folder' ? item.parentId : item.folderId;
    const originalName = item.kind === 'folder' ? item.name : item.originalName;
    try {
      const result = item.kind === 'folder' ? await restoreFolder(item.id, item.trashEventId, controller.signal) : await restoreFile(item.id, item.trashEventId, controller.signal);
      if (controller.signal.aborted) return;
      const restoredParent = 'parentId' in result ? result.parentId : result.folderId;
      const restoredName = 'name' in result ? result.name : result.originalName;
      const current = queryClient.getQueryData<typeof data>(queryKey);
      if (current) {
        const index = current.data.items.findIndex((entry) => itemKey(entry) === key);
        const updatedItems = current.data.items.filter((entry) => itemKey(entry) !== key);
        const total = Math.max(0, current.pagination.total - (index >= 0 ? 1 : 0));
        const totalPages = Math.ceil(total / current.pagination.limit);
        if (window.location.pathname === '/trash' && pageNumber(new URLSearchParams(window.location.search).get('page')) === page) {
          const neighbor = index < 0 ? undefined : updatedItems[index] ?? updatedItems[index - 1];
          nextFocus.current = { page: Math.min(page, Math.max(1, totalPages)), id: neighbor ? itemKey(neighbor) : null };
        }
        queryClient.setQueryData(queryKey, { ...current, data: { ...current.data, items: updatedItems }, pagination: { ...current.pagination, total, totalPages } });
      }
      void queryClient.invalidateQueries({ queryKey: ['trash', user.id] });
      void queryClient.invalidateQueries({ queryKey: ['drive', user.id] });
      const affectedFiles = item.kind === 'folder' ? [user.id] : [user.id, item.id];
      void queryClient.invalidateQueries({ queryKey: ['file', ...affectedFiles] });
      void queryClient.invalidateQueries({ queryKey: ['file-shares', ...affectedFiles] });
      if (item.kind === 'folder') {
        void queryClient.invalidateQueries({ queryKey: ['folder-picker', user.id] });
        void queryClient.invalidateQueries({ queryKey: ['folder-shares', user.id] });
      }
      const movedToRoot = originalParent !== null && restoredParent === null;
      const message = item.kind === 'folder'
        ? (movedToRoot ? text.folderRestoredToRoot : text.folderRestored)
        : (movedToRoot ? text.fileRestoredToRoot : text.fileRestored);
      setNotice({ message, name: restoredName, destinationId: restoredParent, renamed: restoredName !== originalName });
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) expire();
        else {
          setRestoreError({ id: key, message: localizedError(failure, text) });
          if (failure instanceof ApiError && failure.status === 409) {
            heading.current?.focus();
            recheckTrash();
          }
        }
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setRestoring(null);
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
  const numberFormat = new Intl.NumberFormat(locale);
  const totalPages = data?.pagination.totalPages ?? 0;

  return (
    <>
      <DriveLayout user={user} signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h1 id="trash-heading" ref={heading} tabIndex={-1} className="flex w-fit items-center gap-2 rounded-md px-1 py-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              <TrashIcon aria-hidden="true" className="h-6 w-6 text-slate-600 dark:text-slate-400" />{text.trash}
            </h1>
            {canAct && summary && summary.recoverableCount > 0 && (
              <button type="button" data-testid="trash-empty-open" className="button button-danger min-h-11" disabled={Boolean(restoring)} onClick={(event) => {
                setPurgeNotice(null);
                setNotice(null);
                setPurgeIntent({ kind: 'empty', requestId: crypto.randomUUID(), trigger: event.currentTarget });
              }}>{text.emptyTrash}</button>
            )}
          </header>
          {summary && !expired && (
            <section aria-label={text.trashSummary} data-testid="trash-summary" className="panel p-3 sm:p-4">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" aria-live="polite">
                <div className="min-w-0"><dt className="text-slate-600 dark:text-slate-400">{text.trashRemainingBytes}</dt><dd data-testid="trash-remaining-bytes" className="mt-1 font-semibold tabular-nums">{readableSize(summary.remainingBytes, locale)}</dd></div>
                <div><dt className="text-slate-600 dark:text-slate-400">{text.trashAvailable}</dt><dd data-testid="trash-available-count" className="mt-1 font-medium tabular-nums">{numberFormat.format(summary.recoverableCount)}</dd></div>
                <div><dt className="text-slate-600 dark:text-slate-400">{text.trashPurging}</dt><dd data-testid="trash-purging-count" className="mt-1 font-medium tabular-nums">{numberFormat.format(summary.purgingCount)}</dd></div>
                <div><dt className="text-slate-600 dark:text-slate-400">{text.trashRetrying}</dt><dd data-testid="trash-retrying-count" className="mt-1 font-medium tabular-nums">{numberFormat.format(summary.retryingCount)}</dd></div>
              </dl>
            </section>
          )}
          <p role="status" data-testid="trash-purge-notice" className={purgeNotice !== null ? 'rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900 dark:bg-primary-950/60 dark:text-primary-200' : 'sr-only'}>
            {purgeNotice !== null && (purgeNotice > 0 ? text.purgeAccepted(numberFormat.format(purgeNotice)) : text.purgeNoNew)}
          </p>
          <div className={notice ? 'space-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200' : 'sr-only'}>
            <p role="status" data-testid="trash-status" className="[overflow-wrap:anywhere]">
              {notice ? <>{notice.message} <strong data-testid="trash-restored-name">{notice.name}</strong>{notice.renamed && <> {text.renamedOnRestore}</>}</> : query.isFetching ? text.updating : ''}
            </p>
            {notice && <Link data-testid="trash-restore-destination" href={driveHref(notice.destinationId ?? 'root')} prefetch={false} className="inline-flex min-h-11 max-w-full items-center rounded-sm font-medium underline [overflow-wrap:anywhere]">{destinationName ?? text.openRestoreDestination}</Link>}
          </div>
          {error && (
            <div data-testid="trash-error" role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
              <p>{localizedError(error, text)}</p>
              <button data-testid="trash-retry" type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {(query.isPending || shouldMovePage) && !expired && !error && (
            <div data-testid="trash-loading" role="status" aria-busy="true" className="space-y-2">
              <span className="sr-only">{text.loading}</span>
              {Array.from({ length: 3 }, (_, index) => <div key={index} aria-hidden="true" className="h-[4.5rem] rounded-lg border border-slate-200 bg-slate-100 motion-safe:animate-pulse dark:border-slate-800 dark:bg-slate-800" />)}
            </div>
          )}
          {data && !shouldMovePage && items.length === 0 && !isPlaceholderData && !error && (
            <div data-testid="trash-empty" className="flex flex-col items-center gap-3 py-14 text-center sm:py-20">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 sm:h-40 sm:w-40"><TrashIcon aria-hidden="true" className="h-16 w-16 text-slate-400" /></div>
              <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{text.noTrashItems}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">{text.noTrashDescription}</p>
              <Link href="/drive" prefetch={false} className="button button-secondary">{text.backToDrive}</Link>
            </div>
          )}
          {items.length > 0 && !expired && (
            <ul aria-label={text.trash} aria-busy={query.isFetching || verifying} className="space-y-2">
              {items.map((item) => {
                const key = itemKey(item);
                const name = item.kind === 'folder' ? item.name : item.originalName;
                const available = item.purgeStatus === 'available';
                const status = item.purgeStatus === 'purging' ? text.trashPurging : item.purgeStatus === 'retrying' ? text.trashRetrying : canAct ? text.trashAvailable : text.updating;
                const iconMeta = item.kind === 'folder' ? { Icon: FolderIcon, classes: folderIconClasses } : getFileIcon(item.mimeType);
                return (
                  <li key={key} data-testid="trash-item" data-item-id={item.id} data-item-kind={item.kind} data-purge-status={available && !canAct ? undefined : item.purgeStatus} className="panel grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 p-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-3 sm:px-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${iconMeta.classes}`}>
                      <iconMeta.Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium [overflow-wrap:anywhere] sm:line-clamp-2" title={name}>{name}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {item.kind === 'folder' ? text.folder : readableSize(item.size, locale)} <span aria-hidden="true">·</span> <span className="sr-only sm:not-sr-only">{text.trashedOn} </span><time dateTime={item.trashedAt}>{dateFormat.format(new Date(item.trashedAt))}</time>
                      </p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300" data-testid="trash-item-status">{status}</p>
                      {item.deleteAfter ? (
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{text.trashExpires} <time data-testid="trash-expiry" dateTime={item.deleteAfter}>{dateFormat.format(new Date(item.deleteAfter))}</time> ({text.trashTimeZone})</p>
                      ) : <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{text.trashExpiryUnset}</p>}
                    </div>
                    {available && canAct && (
                      <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:col-span-1">
                        <button
                          id={`trash-restore-${key}`} data-testid="trash-restore" type="button" className="button button-secondary min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                          aria-label={`${restoring === key ? text.restoring : text.restore}: ${name}`}
                          aria-busy={restoring === key} aria-disabled={Boolean(restoring)} onClick={() => void restore(item)}
                        >
                          <ArrowUturnLeftIcon aria-hidden="true" className="h-4 w-4" />
                          {restoring === key ? text.restoring : text.restore}
                        </button>
                        <button type="button" data-testid="trash-purge-open" className="button button-secondary min-h-11 text-red-800 dark:text-red-300" disabled={Boolean(restoring)} aria-label={`${text.deletePermanently} ${name}`} onClick={(event) => {
                          setPurgeNotice(null);
                          setNotice(null);
                          setPurgeIntent({ kind: 'single', item, trigger: event.currentTarget });
                        }}>{text.deletePermanently}</button>
                      </div>
                    )}
                    {restoreError?.id === key && <p role="alert" className="col-span-2 text-sm text-red-800 dark:text-red-300 sm:col-span-3">{restoreError.message}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {data && totalPages > 1 && !shouldMovePage && (
            <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
              <p className="text-slate-600 dark:text-slate-400">{text.page} {page} / {totalPages} · {new Intl.NumberFormat(locale).format(data.pagination.total)} {text.items}</p>
              <div className="flex gap-1">
                {page > 1 && <Link href={trashHref(page - 1)} prefetch={false} data-testid="trash-pagination-prev" aria-label={text.previousPage} className="icon-button"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
                {page < totalPages && <Link href={trashHref(page + 1)} prefetch={false} data-testid="trash-pagination-next" aria-label={text.nextPage} className="icon-button"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
              </div>
            </nav>
          )}
        </div>
      </DriveLayout>
      {purgeIntent && (
        <PurgeDialog intent={purgeIntent} suspended={expired} onDismiss={() => setPurgeIntent(null)} onExpired={expire}
          onAccepted={afterPurgeAccepted} onRecheck={recheckTrash} focusAfterClose={() => heading.current?.focus()} />
      )}
      {sessionDialog}
    </>
  );
}
