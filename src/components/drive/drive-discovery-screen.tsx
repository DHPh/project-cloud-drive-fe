'use client';

import { ChevronLeftIcon, ChevronRightIcon, DocumentIcon, FolderIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError, listDriveTimeline, searchDrive, type DriveDiscoveryResponse, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { driveHref, driveSearchHref, fileHref, readDriveSearch, readTimeline, timelineHref, timelineTypes, type DriveSearchFilters, type TimelineFilters } from '@/lib/routes';
import { useAccountSession } from '../account-session';
import { useLocale } from '../providers';
import { DriveLayout, DriveSearch } from './drive-layout';

type Mode = 'search' | 'timeline';
type DiscoveryRow = DriveDiscoveryResponse['data']['items'][number];
const vietnam = 'Asia/Ho_Chi_Minh';
const dayParts = new Intl.DateTimeFormat('en-GB', { timeZone: vietnam, year: 'numeric', month: '2-digit', day: '2-digit' });

function validCalendarDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function timelineGroups(items: DiscoveryRow[]) {
  const groups = new Map<string, DiscoveryRow[]>();
  for (const row of items) {
    const parts = dayParts.formatToParts(new Date(row.item.createdAt));
    const day = ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
    const group = groups.get(day);
    if (group) group.push(row);
    else groups.set(day, [row]);
  }
  return [...groups];
}

function Results({ items, mode }: { items: DiscoveryRow[]; mode: Mode }) {
  const { text, locale } = useLocale();
  return (
    <ul className="space-y-2">
      {items.map(({ item, breadcrumbs }) => {
        const folder = item.kind === 'folder';
        const name = folder ? item.name : item.originalName;
        const parentId = (folder ? item.parentId : item.folderId) ?? 'root';
        const origin = [text.myDrive, ...breadcrumbs.map((crumb) => crumb.name)].join(' / ');
        const Icon = folder ? FolderIcon : DocumentIcon;
        return (
          <li key={`${item.kind}-${item.id}`} data-testid={mode === 'search' ? 'global-drive-row' : 'timeline-row'} data-item-id={item.id} data-kind={item.kind}
            className="panel flex min-w-0 items-start gap-3 px-3 py-2.5">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${folder ? 'bg-amber-50 text-amber-700' : 'bg-primary-100 text-primary-800'}`}>
              <Icon aria-hidden="true" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <Link href={folder ? driveHref(item.id) : fileHref(item.id)} data-testid="discovery-item-link" prefetch={false} className="inline-block rounded-sm pb-1 text-sm font-semibold text-primary-800 hover:underline [overflow-wrap:anywhere]">{name}</Link>
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-gray-600">
                <Link href={driveHref(parentId)} prefetch={false} data-testid="discovery-origin" title={origin} className="max-w-full rounded-sm hover:underline [overflow-wrap:anywhere]">{origin}</Link>
                {!folder && <span>{readableSize(item.size, locale)}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DriveDiscoveryScreen({ initialUser, mode }: { initialUser: User; mode: Mode }) {
  const params = useSearchParams();
  const search = readDriveSearch(params);
  const range = readTimeline(params);
  const activeHref = mode === 'search' ? driveSearchHref(search) : timelineHref(range);
  const { user, expired, expire, signingOut, signOutError, signOut, sessionDialog } = useAccountSession(initialUser, activeHref);
  const { text, locale } = useLocale();
  const invalidRange = mode === 'timeline' && (!validCalendarDate(range.from) || !validCalendarDate(range.to) || Boolean(range.from && range.to && range.from > range.to));
  const idle = mode === 'search' && !search.q;
  const enabled = !expired && !idle && !invalidRange;
  const query = useQuery<DriveDiscoveryResponse>({
    queryKey: ['drive', user.id, mode, activeHref],
    queryFn: ({ signal }) => mode === 'search' ? searchDrive(search, signal) : listDriveTimeline(range, signal),
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const { error, data } = query;
  const problem = error && !(error instanceof ApiError && error.status === 401) ? error : null;
  const items = !error && enabled ? data?.data.items : undefined;
  const page = mode === 'search' ? search.page : range.page;
  const totalPages = data?.pagination.totalPages ?? 0;
  const title = mode === 'search' ? text.globalDriveSearch : text.timeline;
  const dateFormat = new Intl.DateTimeFormat(locale, { timeZone: vietnam, dateStyle: 'full' });
  const kindNames = { all: text.allTypes, image: text.typeImage, video: text.typeVideo, audio: text.typeAudio, pdf: text.typePdf, document: text.typeDocument, other: text.typeOther };

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) expire();
  }, [error, expire]);

  function onSearch(q: string) {
    const latest = readDriveSearch(new URLSearchParams(window.location.search));
    if (q !== latest.q) window.history.replaceState(null, '', driveSearchHref({ ...latest, q, page: 1 }));
  }

  function changeSearch(changes: Partial<DriveSearchFilters>) {
    const latest = readDriveSearch(new URLSearchParams(window.location.search));
    window.history.pushState(null, '', driveSearchHref({ ...latest, ...changes, page: 1 }));
  }

  function changeRange(changes: Partial<TimelineFilters>) {
    const latest = readTimeline(new URLSearchParams(window.location.search));
    window.history.pushState(null, '', timelineHref({ ...latest, ...changes, page: 1 }));
  }

  function pageHref(target: number) {
    return mode === 'search' ? driveSearchHref({ ...search, page: target }) : timelineHref({ ...range, page: target });
  }

  return (
    <>
      <DriveLayout user={user} section={mode} signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {mode === 'search' ? (
            <section className="panel space-y-3 p-3 sm:p-4" aria-label={title}>
              <DriveSearch search={search.q} onSearch={onSearch} label={text.searchKeyword} testId="global-drive-query" />
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 space-y-1 text-sm font-medium">{text.filterType}
                  <select data-testid="global-drive-type" className="field" value={search.type} onChange={(event) => changeSearch({ type: event.currentTarget.value as DriveSearchFilters['type'] })}>
                    <option value="all">{text.allTypes}</option><option value="files">{text.files}</option><option value="folders">{text.folders}</option>
                  </select>
                </label>
                <label className="min-w-0 space-y-1 text-sm font-medium">{text.sortResults}
                  <select data-testid="global-drive-sort" className="field" value={search.sort} onChange={(event) => changeSearch({ sort: event.currentTarget.value as DriveSearchFilters['sort'] })}>
                    <option value="name">{text.sortByName}</option><option value="newest">{text.sortNewest}</option>
                  </select>
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input data-testid="global-drive-metadata" type="checkbox" className="h-5 w-5 shrink-0 accent-primary-700" checked={search.includeMetadata} onChange={(event) => changeSearch({ includeMetadata: event.currentTarget.checked })} />{text.searchMetadata}
                </label>
              </div>
            </section>
          ) : (
            <section className="panel space-y-2 p-3 sm:p-4" aria-label={title}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="min-w-0 space-y-1 text-sm font-medium">{text.fromDate}
                  <input data-testid="timeline-from" type="date" className="field min-w-0" value={range.from} aria-invalid={invalidRange} onChange={(event) => changeRange({ from: event.currentTarget.value })} />
                </label>
                <label className="min-w-0 space-y-1 text-sm font-medium">{text.toDate}
                  <input data-testid="timeline-to" type="date" className="field min-w-0" value={range.to} aria-invalid={invalidRange} onChange={(event) => changeRange({ to: event.currentTarget.value })} />
                </label>
                <label className="min-w-0 space-y-1 text-sm font-medium">{text.filterType}
                  <select data-testid="timeline-type" className="field" value={range.type} onChange={(event) => changeRange({ type: event.currentTarget.value as TimelineFilters['type'] })}>
                    {timelineTypes.map((type) => <option key={type} value={type}>{kindNames[type]}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-xs text-gray-600">{text.vietnamDateRange}</p>
              {invalidRange && <p role="alert" data-testid="timeline-date-error" className="text-sm text-red-800">{text.invalidDateRange}</p>}
            </section>
          )}
          {idle && !expired && <p data-testid="global-drive-idle" className="panel p-5 text-sm text-gray-600">{text.searchDriveIdle}</p>}
          {enabled && query.isPending && <p role="status" data-testid="discovery-loading" className="panel p-5 text-sm text-gray-600">{text.loading}</p>}
          {enabled && problem && (
            <div role="alert" data-testid="discovery-error" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p>{localizedError(problem, text)}</p>
              <button data-testid="discovery-retry" type="button" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {items?.length === 0 && <p role="status" data-testid="discovery-empty" className="panel p-5 text-sm text-gray-600">{mode === 'search' ? text.noDriveSearchResults : text.noTimelineFiles}</p>}
          {items && items.length > 0 && (
            <div className="space-y-5" aria-busy={query.isFetching}>
              {mode === 'search' ? <Results items={items} mode={mode} /> : (
                timelineGroups(items).map(([day, group]) => (
                  <section key={day} data-testid="timeline-day" data-upload-day={day} aria-labelledby={`timeline-date-${day}`} className="space-y-2">
                    <h2 id={`timeline-date-${day}`} className="text-sm font-semibold text-gray-700"><time dateTime={day}>{dateFormat.format(new Date(group[0]!.item.createdAt))}</time></h2>
                    <Results items={group} mode={mode} />
                  </section>
                ))
              )}
            </div>
          )}
          {enabled && data && !error && (totalPages > 1 || page > 1) && (
            <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
              <p className="text-gray-600">{text.page} {page} / {Math.max(1, totalPages)}</p>
              <div className="flex gap-1">
                {page > 1 && <Link data-testid="discovery-prev" href={pageHref(Math.max(1, Math.min(totalPages, page - 1)))} prefetch={false} aria-label={text.previousPage} className="icon-button"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
                {page < totalPages && <Link data-testid="discovery-next" href={pageHref(page + 1)} prefetch={false} aria-label={text.nextPage} className="icon-button"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
              </div>
            </nav>
          )}
        </div>
      </DriveLayout>
      {sessionDialog}
    </>
  );
}
