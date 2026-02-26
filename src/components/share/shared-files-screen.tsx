'use client';

import { ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError, downloadUrl, listSharedFiles, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { fileHref, pageNumber, sharedHref } from '@/lib/routes';
import { shareDateFormat } from '@/lib/share-expiry';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { useLocale } from '../providers';
import { useShareExpiryRefresh } from '../use-share-expiry-refresh';

export function SharedFilesScreen({ initialUser }: { initialUser: User }) {
  const page = pageNumber(useSearchParams().get('page'));
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, sharedHref(page));
  const { locale, text } = useLocale();
  const query = useQuery({
    queryKey: ['shared-with-me', user.id, page],
    queryFn: ({ signal }) => listSharedFiles(page, signal),
    enabled: !expired,
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const { data, error, isPlaceholderData } = query;
  const requestError = error && !(error instanceof ApiError && error.status === 401) ? error : null;
  const totalPages = data?.pagination.totalPages ?? 0;
  const lastPage = Math.max(1, totalPages);
  const shouldMovePage = Boolean(data && !isPlaceholderData && page > lastPage);
  const checkingAccess = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const items = data?.data.items;
  const dateFormat = shareDateFormat(locale);
  useShareExpiryRefresh(expired || isPlaceholderData ? undefined : items, query.refetch);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) expire();
  }, [error, expire]);

  useEffect(() => {
    if (shouldMovePage) window.history.replaceState(null, '', sharedHref(lastPage));
  }, [shouldMovePage, lastPage]);

  return (
    <>
      <DriveLayout user={user} section="shared" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <h1 id="shared-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <UserGroupIcon aria-hidden="true" className="h-6 w-6 shrink-0 text-gray-600" />{text.sharedWithMe}
          </h1>
          {requestError && (
            <div data-testid="shared-error" role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
              <p>{localizedError(requestError, text)}</p>
              <button data-testid="shared-retry" type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {(checkingAccess || shouldMovePage) && !expired && !requestError && (
            <div data-testid="shared-loading" role="status" aria-busy="true" className="space-y-2">
              <span className="sr-only">{text.loading}</span>
              {Array.from({ length: 3 }, (_, index) => <div key={index} aria-hidden="true" className="h-[4.5rem] rounded-lg border border-gray-100 bg-gray-100 motion-safe:animate-pulse" />)}
            </div>
          )}
          {items?.length === 0 && !error && !isPlaceholderData && !shouldMovePage && !expired && !checkingAccess && (
            <div data-testid="shared-empty" className="flex flex-col items-center gap-3 py-14 text-center sm:py-20">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-100 sm:h-40 sm:w-40"><UserGroupIcon aria-hidden="true" className="h-16 w-16 text-gray-400" /></div>
              <h2 className="text-lg font-semibold">{text.noSharedFiles}</h2>
              <p className="text-sm text-gray-600">{text.noSharedDescription}</p>
              <Link href="/drive" prefetch={false} className="button button-secondary">{text.backToDrive}</Link>
            </div>
          )}
          {items && items.length > 0 && !error && !expired && !checkingAccess && (
            <ul aria-label={text.sharedWithMe} aria-busy={query.isFetching} className="space-y-2">
              {items.map((item) => (
                <li key={item.id} data-testid="shared-item" data-item-id={item.id} className="panel grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2.5 sm:gap-3 sm:px-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-100 text-primary-800 sm:h-10 sm:w-10"><DocumentIcon aria-hidden="true" className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <Link data-testid="shared-file-link" href={fileHref(item.id)} prefetch={false} className="line-clamp-2 break-words rounded-sm text-sm font-medium text-primary-800 hover:underline" title={item.originalName}>{item.originalName}</Link>
                    <p className="mt-0.5 break-words text-xs text-gray-600">{text.sharedBy} <span className="font-medium">{item.ownerName}</span> <span aria-hidden="true">·</span> {readableSize(item.size, locale)}</p>
                    <p className="mt-0.5 text-xs text-gray-600">{text.expiresAt} <time dateTime={item.expiresAt}>{dateFormat.format(new Date(item.expiresAt))}</time> ({text.vietnamTime})</p>
                  </div>
                  <a data-testid="shared-file-download" href={downloadUrl(item.id)} download={item.originalName} className="icon-button h-11 w-11" aria-label={`${text.download}: ${item.originalName}`} title={text.download}><ArrowDownTrayIcon aria-hidden="true" className="h-5 w-5" /></a>
                </li>
              ))}
            </ul>
          )}
          {data && totalPages > 1 && !shouldMovePage && !requestError && !expired && !checkingAccess && (
            <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
              <p className="text-gray-600">{text.page} {page} / {totalPages} · {new Intl.NumberFormat(locale).format(data.pagination.total)} {text.items}</p>
              <div className="flex gap-1">
                {page > 1 && <Link data-testid="shared-pagination-prev" href={sharedHref(page - 1)} prefetch={false} aria-label={text.previousPage} className="icon-button"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
                {page < totalPages && <Link data-testid="shared-pagination-next" href={sharedHref(page + 1)} prefetch={false} aria-label={text.nextPage} className="icon-button"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
              </div>
            </nav>
          )}
        </div>
      </DriveLayout>
      {sessionDialog}
    </>
  );
}
