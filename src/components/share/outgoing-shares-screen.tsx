'use client';

import { ChevronLeftIcon, ChevronRightIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, listOutgoingShares, type OutgoingShare, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { driveHref, fileHref, outgoingSharesHref, readOutgoingShares, type OutgoingFilters } from '@/lib/routes';
import { shareDateFormat } from '@/lib/share-expiry';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { ShareDialog } from '../drive/share-dialog';
import { useLocale } from '../providers';
import { useShareExpiryRefresh } from '../use-share-expiry-refresh';
import { ShareQrDialog } from './share-qr-dialog';

type ActiveDialog = { kind: 'renew' | 'revoke' | 'qr'; row: OutgoingShare; trigger: HTMLElement; url: string };

function itemHref(row: OutgoingShare) {
  return row.kind === 'folder' ? driveHref(row.resourceId) : fileHref(row.resourceId);
}

export function OutgoingSharesScreen({ initialUser }: { initialUser: User }) {
  const filters = readOutgoingShares(useSearchParams());
  const href = outgoingSharesHref(filters);
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, href);
  const { locale, text } = useLocale();
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: ['outgoing-shares', user.id, href],
    queryFn: ({ signal }) => listOutgoingShares(filters, signal),
    enabled: !expired,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const { data, error } = query;
  const grants = useMemo(() => data?.data.items.map((row) => row.grant), [data]);
  useShareExpiryRefresh(expired ? undefined : grants, query.refetch);
  const problem = error && !(error instanceof ApiError && error.status === 401) ? error : null;
  const latestPage = Math.max(1, data?.pagination.totalPages ?? 1);
  const shouldMovePage = Boolean(data && !error && filters.page > latestPage);
  const items = !error && !expired && !shouldMovePage ? data?.data.items : undefined;
  const timeFormat = shareDateFormat(locale);

  useEffect(() => { if (error instanceof ApiError && error.status === 401) expire(); }, [error, expire]);
  useEffect(() => {
    if (shouldMovePage) window.history.replaceState(null, '', outgoingSharesHref({ ...readOutgoingShares(new URLSearchParams(window.location.search)), page: latestPage }));
  }, [latestPage, shouldMovePage]);

  function changeFilters(changes: Partial<OutgoingFilters>) {
    setNotice('');
    const latest = readOutgoingShares(new URLSearchParams(window.location.search));
    window.history.pushState(null, '', outgoingSharesHref({ ...latest, ...changes, page: 1 }));
  }

  function openAction(kind: ActiveDialog['kind'], row: OutgoingShare, trigger: HTMLElement) {
    setNotice('');
    setActive({ kind, row, trigger, url: new URL(itemHref(row), window.location.origin).href });
  }

  async function copyRow(row: OutgoingShare, trigger: HTMLElement) {
    try {
      await navigator.clipboard.writeText(new URL(itemHref(row), window.location.origin).href);
      setNotice(text.shareCopied);
    } catch {
      openAction('qr', row, trigger);
    }
  }

  return (
    <>
      <DriveLayout user={user} section="outgoing" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <h1 ref={heading} tabIndex={-1} id="outgoing-heading" className="flex w-fit items-center gap-2 rounded-md px-1 py-1 text-lg font-semibold text-gray-900">
            <ShareIcon aria-hidden="true" className="h-6 w-6 shrink-0 text-gray-600" />{text.sharedByMe}
          </h1>
          <div className="panel flex flex-wrap items-end gap-3 p-3 sm:p-4">
            <label className="min-w-0 space-y-1 text-sm font-medium">{text.filterType}
              <select data-testid="outgoing-type" className="field" value={filters.type} onChange={(event) => changeFilters({ type: event.currentTarget.value as OutgoingFilters['type'] })}>
                <option value="all">{text.allTypes}</option><option value="files">{text.files}</option><option value="folders">{text.folders}</option>
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-sm font-medium">{text.outgoingStatus}
              <select data-testid="outgoing-status-filter" className="field" value={filters.status} onChange={(event) => changeFilters({ status: event.currentTarget.value as OutgoingFilters['status'] })}>
                <option value="all">{text.allShareStatuses}</option><option value="active">{text.shareActive}</option><option value="expired">{text.shareExpired}</option>
              </select>
            </label>
          </div>
          <p role="status" data-testid="outgoing-notice" className={notice ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900' : 'sr-only'}>{notice}</p>
          {(query.isPending || shouldMovePage) && !expired && <p role="status" data-testid="outgoing-loading" className="panel p-4 text-sm text-gray-600">{text.loading}</p>}
          {problem && !expired && (
            <div role="alert" data-testid="outgoing-error" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>{localizedError(problem, text)}</p><button type="button" data-testid="outgoing-retry" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {items?.length === 0 && <p data-testid="outgoing-empty" role="status" className="panel p-4 text-sm text-gray-600">{text.noOutgoingShares}</p>}
          {items && items.length > 0 && (
            <ul className="space-y-2" aria-label={text.sharedByMe} aria-busy={query.isFetching}>
              {items.map((row) => (
                <li key={`${row.kind}-${row.resourceId}-${row.grant.recipientId}`} data-testid="outgoing-row" data-kind={row.kind} data-resource-id={row.resourceId} data-recipient-id={row.grant.recipientId} data-grant-status={row.grant.isActive ? 'active' : 'expired'}
                  className="panel space-y-2 p-3 sm:flex sm:items-start sm:justify-between sm:gap-3 sm:space-y-0 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <Link data-testid="outgoing-item-link" href={itemHref(row)} prefetch={false} className="inline-block rounded-sm text-sm font-semibold text-primary-800 hover:underline [overflow-wrap:anywhere]">{row.resourceName}</Link>
                    <p className="mt-1 text-sm text-gray-700 [overflow-wrap:anywhere]">{row.kind === 'folder' ? text.folder : text.files} · {row.grant.recipientName} ({row.grant.recipientEmail})</p>
                    <p className="mt-1 text-sm text-gray-700">{text.expiresAt} <time data-testid="outgoing-expiry" dateTime={row.grant.expiresAt}>{timeFormat.format(new Date(row.grant.expiresAt))}</time> ({text.vietnamTime})</p>
                    <p className={`mt-2 w-fit rounded-full px-2 py-1 text-xs ${row.grant.isActive ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-100 text-gray-700'}`}>{row.grant.isActive ? text.shareActive : text.shareExpired}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:max-w-[50%] sm:justify-end">
                    <button type="button" data-testid="outgoing-renew" className="button button-secondary min-h-11" onClick={(event) => openAction('renew', row, event.currentTarget)}>{text.renewShare}</button>
                    <button type="button" data-testid="outgoing-revoke" className="button button-secondary min-h-11 text-red-800" onClick={(event) => openAction('revoke', row, event.currentTarget)}>{text.shareRevoke}</button>
                    <button type="button" data-testid="outgoing-copy" className="button button-secondary min-h-11" onClick={(event) => void copyRow(row, event.currentTarget)}>{text.shareCopy}</button>
                    <button type="button" data-testid="outgoing-qr" className="button button-secondary min-h-11" onClick={(event) => openAction('qr', row, event.currentTarget)}>{text.shareQr}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data && !error && !expired && !shouldMovePage && latestPage > 1 && (
            <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
              <p>{text.page} {filters.page} / {latestPage}</p>
              <div className="flex gap-2">
                {filters.page > 1 && <Link data-testid="outgoing-prev" href={outgoingSharesHref({ ...filters, page: filters.page - 1 })} prefetch={false} aria-label={text.previousPage} className="icon-button"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
                {filters.page < latestPage && <Link data-testid="outgoing-next" href={outgoingSharesHref({ ...filters, page: filters.page + 1 })} prefetch={false} aria-label={text.nextPage} className="icon-button"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
              </div>
            </nav>
          )}
        </div>
      </DriveLayout>
      {active?.kind === 'qr' && !expired && <ShareQrDialog href={itemHref(active.row)} url={active.url} title={active.row.resourceName} trigger={active.trigger} onDismiss={() => setActive(null)} restoreFallback={() => heading.current?.focus()} />}
      {active && active.kind !== 'qr' && (
        <ShareDialog item={active.row.kind === 'folder' ? { kind: 'folder', id: active.row.resourceId, name: active.row.resourceName } : { kind: 'file', id: active.row.resourceId, originalName: active.row.resourceName }}
          itemLink={active.url} userId={user.id} trigger={active.trigger} suspended={expired} initialAction={{ kind: active.kind, grant: active.row.grant }}
          onDismiss={() => setActive(null)} onExpired={expire} onChanged={setNotice} restoreFallback={() => heading.current?.focus()} />
      )}
      {sessionDialog}
    </>
  );
}
