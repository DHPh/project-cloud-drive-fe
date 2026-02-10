'use client';

import { ArrowUpTrayIcon, ChevronLeftIcon, ChevronRightIcon, FolderIcon, HomeIcon, ListBulletIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, currentUser, listFolder, logout, type FileItem, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { driveHref, pageNumber, type DriveView } from '@/lib/routes';
import { publishSessionChange, subscribeToSessionChanges } from '@/lib/session-events';
import { LoginForm } from '../login-form';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';
import { DriveItems } from './drive-items';
import { DriveLayout } from './drive-layout';
import { RenameDialog } from './rename-dialog';
import { UploadDialog } from './upload-dialog';

type ActiveDialog = { kind: 'upload'; trigger: HTMLElement | null } | { kind: 'rename'; file: FileItem; trigger: HTMLElement };

export function DriveScreen({ initialUser }: { initialUser: User }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(initialUser);
  const [expired, setExpired] = useState(false);
  const { text } = useLocale();
  const params = useSearchParams();
  const folder = params.get('folder') || 'root';
  const search = params.get('q') || '';
  const page = pageNumber(params.get('page'));
  const view: DriveView = params.get('view') === 'list' ? 'list' : 'grid';
  const activeUrl = driveHref(folder, search, page, view);
  const previousFolder = useRef(folder);

  const expire = useCallback(() => setExpired(true), []);

  useEffect(() => {
    if (previousFolder.current === folder) return;
    previousFolder.current = folder;
    document.getElementById('drive-main')?.focus({ preventScroll: true });
  }, [folder]);

  useEffect(() => subscribeToSessionChanges(() => {
    void queryClient.cancelQueries().finally(() => {
      queryClient.clear();
      window.location.reload();
    });
  }), [queryClient]);

  async function reauthenticate(nextUser: User) {
    await queryClient.cancelQueries();
    queryClient.clear();
    if (nextUser.id !== user.id) {
      publishSessionChange();
      window.location.replace(activeUrl);
      return;
    }
    setUser(nextUser);
    setExpired(false);
  }

  return (
    <>
      <DriveFolder key={`${user.id}:${folder}`} user={user} folder={folder} search={search} page={page} view={view} expired={expired} onExpired={expire} />
      {expired && (
        <Overlay title={text.sessionTitle} description={text.sessionDescription}>
          <LoginForm email={user.email} onSuccess={reauthenticate} className="min-h-0 overflow-y-auto p-5 sm:p-6" />
        </Overlay>
      )}
    </>
  );
}

type FolderProps = { user: User; folder: string; search: string; page: number; view: DriveView; expired: boolean; onExpired: () => void };

function DriveFolder({ user, folder, search, page, view, expired, onExpired }: FolderProps) {
  const { text, locale } = useLocale();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const signOutLock = useRef(false);

  const queryKey = ['drive', user.id, folder, search, page] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listFolder(folder, search, page, signal),
    enabled: !expired,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === folder ? previous : undefined,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) onExpired();
  }, [query.error, onExpired]);

  useEffect(() => {
    const accountCheck = new AbortController();
    void currentUser(accountCheck.signal).then((checked) => {
      if (checked.id !== user.id) window.location.reload();
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onExpired();
    });
    return () => accountCheck.abort();
  }, [onExpired, user.id]);

  function changeSearch(next: string) {
    if (next !== search) window.history.replaceState(null, '', driveHref(folder, next, 1, view));
  }

  function updateList() {
    void queryClient.invalidateQueries({ queryKey: ['drive', user.id, folder] });
  }

  async function signOut() {
    if (signOutLock.current) return;
    signOutLock.current = true;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      setDialog(null);
      await queryClient.cancelQueries();
      queryClient.clear();
      publishSessionChange();
      window.location.replace('/login');
    } catch (error) {
      setSignOutError(localizedError(error, text));
    } finally {
      signOutLock.current = false;
      setSigningOut(false);
    }
  }

  const data = query.data;
  const folders = data?.data.items.filter((item) => item.kind === 'folder') ?? [];
  const files = data?.data.items.filter((item) => item.kind === 'file') ?? [];
  const homeHref = driveHref('root', '', 1, view);
  const error = query.error && (!(query.error instanceof ApiError) || query.error.status !== 401) ? query.error : null;
  const empty = data && data.data.items.length === 0 && !query.isPlaceholderData;
  const canGoNext = data && page < data.pagination.totalPages;

  return (
    <DriveLayout
      user={user} folder={folder} homeHref={homeHref} search={search} onSearch={changeSearch}
      signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}
      onUpload={(trigger) => { setNotice(''); setDialog({ kind: 'upload', trigger }); }}
    >
      <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
        <h1 className="sr-only">{text.myDrive}</h1>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <nav className="min-w-0" aria-label={text.breadcrumb}>
            <ol className="flex flex-wrap items-center gap-1 text-sm font-medium text-gray-800 sm:text-base">
              <li>
                <Link href={homeHref} prefetch={false} aria-current={folder === 'root' ? 'page' : undefined} className="flex min-h-10 items-center gap-1.5 rounded-md px-1 py-1 text-base font-semibold hover:text-primary-800 sm:text-lg">
                  <HomeIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-gray-500" />{text.myDrive}
                </Link>
              </li>
              {data?.data.breadcrumbs.map((crumb) => (
                <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                  <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-500" />
                  {crumb.id === folder
                    ? <span aria-current="page" title={crumb.name} className="max-w-[11rem] truncate sm:max-w-sm">{crumb.name}</span>
                    : <Link href={driveHref(crumb.id, '', 1, view)} prefetch={false} className="max-w-[11rem] truncate rounded-md px-1 py-1.5 hover:text-primary-800 sm:max-w-sm" title={crumb.name}>{crumb.name}</Link>}
                </li>
              ))}
            </ol>
          </nav>
          <div role="group" aria-label={text.display} className="flex shrink-0 rounded-lg bg-gray-100 p-0.5">
            <button type="button" aria-label={text.grid} title={text.grid} aria-pressed={view === 'grid'} className={`icon-button ${view === 'grid' ? 'bg-white shadow-sm' : ''}`} onClick={() => window.history.replaceState(null, '', driveHref(folder, search, page, 'grid'))}><Squares2X2Icon className="h-5 w-5" /></button>
            <button type="button" aria-label={text.list} title={text.list} aria-pressed={view === 'list'} className={`icon-button ${view === 'list' ? 'bg-white shadow-sm' : ''}`} onClick={() => window.history.replaceState(null, '', driveHref(folder, search, page, 'list'))}><ListBulletIcon className="h-5 w-5" /></button>
          </div>
        </div>
        <span role="status" className="sr-only">{notice || (query.isFetching ? text.updating : '')}</span>
        {search && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate rounded-full bg-primary-50 px-3 py-1.5 text-sm text-primary-900" title={search}>{search}</span>
            <Link href={driveHref(folder, '', 1, view)} scroll={false} prefetch={false} className="shrink-0 rounded-md text-sm font-medium text-primary-800 hover:underline">{text.clearSearch}</Link>
          </div>
        )}
        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
            <p>{localizedError(error, text)}</p>
            <button type="button" className="button button-secondary" onClick={() => void query.refetch()}>{text.retry}</button>
          </div>
        )}
        {query.isPending && !expired && !error && (
          <div role="status" aria-busy="true" className="space-y-4">
            <span className="sr-only">{text.loading}</span>
            <div aria-hidden="true" className={view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]' : 'space-y-1.5'}>
              {Array.from({ length: 4 }, (_, index) => <div key={index} className={`motion-safe:animate-pulse rounded-xl border border-gray-100 bg-gray-100 ${view === 'grid' ? 'h-[172px]' : 'h-14'}`} />)}
            </div>
          </div>
        )}
        {data && (
          <div aria-busy={query.isFetching} className="relative min-w-0 space-y-6">
            {query.isFetching && !error && <div aria-hidden="true" className="absolute inset-x-0 -top-3 h-0.5 motion-safe:animate-pulse rounded bg-primary-400" />}
            {empty && (
              <div data-testid={search ? 'drive-empty-search' : 'drive-empty-folder'} className="flex flex-col items-center gap-3 py-14 text-center sm:py-20">
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-100 sm:h-40 sm:w-40"><FolderIcon aria-hidden="true" className="h-20 w-20 text-gray-300" /></div>
                <h2 className="mt-2 text-lg font-semibold">
                  {search ? text.noResults : page > 1 ? text.emptyPage : text.noFolderItems}
                </h2>
                {search ? <p className="text-sm text-gray-600">{text.noResultsDescription}</p> : page === 1 && <p className="text-sm text-gray-600">{text.noFolderItemsDescription}</p>}
                {page > 1 ? (
                  <Link href={driveHref(folder, search, 1, view)} prefetch={false} className="button button-secondary">{text.firstPage}</Link>
                ) : !search && (
                  <button type="button" data-testid="upload-empty-open" className="button button-primary" onClick={(event) => setDialog({ kind: 'upload', trigger: event.currentTarget })}><ArrowUpTrayIcon className="h-5 w-5" />{text.upload}</button>
                )}
              </div>
            )}
            <DriveItems title={text.folders} items={folders} view={view} onRename={(file, trigger) => setDialog({ kind: 'rename', file, trigger })} />
            <DriveItems title={text.files} items={files} view={view} onRename={(file, trigger) => { setNotice(''); setDialog({ kind: 'rename', file, trigger }); }} />
            {data.pagination.totalPages > 1 && (
              <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
                <p className="text-gray-600">{text.page} {page} / {data.pagination.totalPages} · {new Intl.NumberFormat(locale).format(data.pagination.total)} {text.items}</p>
                <div className="flex gap-1">
                  {page > 1 && <Link href={driveHref(folder, search, page - 1, view)} prefetch={false} data-testid="drive-pagination-prev" aria-label={text.previousPage} title={text.previousPage} className="icon-button"><ChevronLeftIcon className="h-5 w-5" /></Link>}
                  {canGoNext && <Link href={driveHref(folder, search, page + 1, view)} prefetch={false} data-testid="drive-pagination-next" aria-label={text.nextPage} title={text.nextPage} className="icon-button"><ChevronRightIcon className="h-5 w-5" /></Link>}
                </div>
              </nav>
            )}
          </div>
        )}
      </div>
      {dialog?.kind === 'upload' && (
        <UploadDialog folder={folder} suspended={expired} trigger={dialog.trigger} onDismiss={() => setDialog(null)} onSessionExpired={onExpired} onUploaded={updateList} onRefresh={async () => (await query.refetch()).isSuccess} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog file={dialog.file} suspended={expired} trigger={dialog.trigger} onDismiss={() => setDialog(null)} onSessionExpired={onExpired} onSaved={(file) => {
          queryClient.setQueryData(queryKey, (previous: typeof data) => previous && {
            ...previous,
            data: { ...previous.data, items: previous.data.items.map((item) => item.id === file.id ? file : item) },
          });
          updateList();
          setNotice(text.fileRenamed);
        }} />
      )}
    </DriveLayout>
  );
}
