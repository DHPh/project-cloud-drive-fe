'use client';

import { ArrowUpTrayIcon, ChevronLeftIcon, ChevronRightIcon, FolderIcon, HomeIcon, ListBulletIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, listFolder, type FileItem, type FolderItem, type FolderSummary, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { driveHref, fileHref, pageNumber, type DriveView } from '@/lib/routes';
import { useAccountSession } from '../account-session';
import { useLocale } from '../providers';
import { DriveItems } from './drive-items';
import { DriveLayout } from './drive-layout';
import { MoveDialog } from './folder-move-dialog';
import { FolderNameDialog } from './folder-name-dialog';
import { RenameDialog } from './rename-dialog';
import { ShareDialog } from './share-dialog';
import { TrashDialog } from './trash-dialog';
import { UploadDialog } from './upload-dialog';

type ActiveDialog =
  | { kind: 'upload' | 'create-folder'; trigger: HTMLElement | null }
  | { kind: 'rename'; file: FileItem; trigger: HTMLElement }
  | { kind: 'trash'; item: FolderItem; trigger: HTMLElement }
  | { kind: 'share'; item: FolderItem; itemLink: string; trigger: HTMLElement }
  | { kind: 'rename-folder'; folder: FolderSummary; trigger: HTMLElement }
  | { kind: 'move'; item: FolderItem; trigger: HTMLElement };

export function DriveScreen({ initialUser }: { initialUser: User }) {
  const params = useSearchParams();
  const folder = params.get('folder') || 'root';
  const search = params.get('q') || '';
  const page = pageNumber(params.get('page'));
  const view: DriveView = params.get('view') === 'list' ? 'list' : 'grid';
  const session = useAccountSession(initialUser, driveHref(folder, search, page, view));
  const previousFolder = useRef(folder);

  useEffect(() => {
    if (previousFolder.current === folder) return;
    previousFolder.current = folder;
    document.getElementById('drive-main')?.focus({ preventScroll: true });
  }, [folder]);

  return (
    <>
      <DriveFolder key={`${session.user.id}:${folder}`} session={session} folder={folder} search={search} page={page} view={view} />
      {session.sessionDialog}
    </>
  );
}

type FolderProps = { session: ReturnType<typeof useAccountSession>; folder: string; search: string; page: number; view: DriveView };

function DriveFolder({ session, folder, search, page, view }: FolderProps) {
  const { user, expired, expire: onExpired, signingOut, signOutError, signOut } = session;
  const { text, locale } = useLocale();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [notice, setNotice] = useState<{ message: string; href?: string } | null>(null);
  const nextTrashFocus = useRef<string | null>(null);
  const nextMoveFocus = useRef<string | null>(null);

  const queryKey = ['drive', user.id, folder, search, page] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listFolder(folder, search, page, signal),
    enabled: !expired,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === folder ? previous : undefined,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) onExpired();
  }, [query.error, onExpired]);

  function changeSearch(next: string) {
    if (next !== search) window.history.replaceState(null, '', driveHref(folder, next, 1, view));
  }

  function updateList() {
    void queryClient.invalidateQueries({ queryKey: ['drive', user.id, folder] });
  }

  const checkingAccess = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const data = query.error || checkingAccess || expired ? undefined : query.data;
  const canManage = data?.data.access === 'owner';
  const readOnly = data?.data.access === 'viewer';
  const folders = data?.data.items.filter((item) => item.kind === 'folder') ?? [];
  const files = data?.data.items.filter((item) => item.kind === 'file') ?? [];
  const homeHref = driveHref('root', '', 1, view);
  const error = query.error && (!(query.error instanceof ApiError) || query.error.status !== 401) ? query.error : null;
  const empty = data && data.data.items.length === 0 && !query.isPlaceholderData;
  const canGoNext = data && page < data.pagination.totalPages;

  function openRename(file: FileItem, trigger: HTMLElement) {
    setNotice(null);
    setDialog({ kind: 'rename', file, trigger });
  }

  function openTrash(item: FolderItem, trigger: HTMLElement) {
    setNotice(null);
    nextTrashFocus.current = null;
    setDialog({ kind: 'trash', item, trigger });
  }

  function openShare(item: FolderItem, trigger: HTMLElement) {
    setNotice(null);
    const href = item.kind === 'folder' ? driveHref(item.id) : fileHref(item.id);
    setDialog({ kind: 'share', item, itemLink: new URL(href, window.location.origin).href, trigger });
  }

  function openFolderRename(item: FolderSummary, trigger: HTMLElement) {
    setNotice(null);
    setDialog({ kind: 'rename-folder', folder: item, trigger });
  }

  function openMove(item: FolderItem, trigger: HTMLElement) {
    setNotice(null);
    nextMoveFocus.current = null;
    setDialog({ kind: 'move', item, trigger });
  }

  async function refreshFolderLists() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['drive', user.id] }),
      queryClient.invalidateQueries({ queryKey: ['folder-picker', user.id] }),
    ]);
  }

  function onItemMoved(item: FolderItem) {
    const candidates = item.kind === 'folder' ? folders : files;
    const index = candidates.findIndex((entry) => entry.id === item.id);
    const neighbor = index < 0 ? undefined : candidates[index + 1] ?? candidates[index - 1];
    nextMoveFocus.current = neighbor ? `${item.kind}-move-${neighbor.id}` : null;
    queryClient.setQueryData(queryKey, (previous: typeof data) => previous && {
      ...previous,
      data: { ...previous.data, items: previous.data.items.filter((entry) => entry.id !== item.id) },
    });
    void refreshFolderLists();
    if (item.kind === 'file') void queryClient.invalidateQueries({ queryKey: ['file', user.id, item.id] });
    const target = item.kind === 'folder' ? item.parentId : item.folderId;
    setNotice({ message: item.kind === 'folder' ? text.folderMoved : text.fileMoved, href: driveHref(target ?? 'root', '', 1, view) });
    setDialog(null);
  }

  function onTrashed(item: FolderItem) {
    const candidates = item.kind === 'folder' ? folders : files;
    const index = candidates.findIndex((entry) => entry.id === item.id);
    const neighbor = index < 0 ? undefined : candidates[index + 1] ?? candidates[index - 1];
    nextTrashFocus.current = neighbor ? `drive-trash-${item.kind}-${neighbor.id}` : null;
    queryClient.setQueryData(queryKey, (previous: typeof data) => previous && {
      ...previous,
      data: { ...previous.data, items: previous.data.items.filter((entry) => entry.kind !== item.kind || entry.id !== item.id) },
    });
    void refreshFolderLists();
    void queryClient.invalidateQueries({ queryKey: ['trash', user.id] });
    const affectedFiles = item.kind === 'folder' ? [user.id] : [user.id, item.id];
    void queryClient.invalidateQueries({ queryKey: ['file', ...affectedFiles] });
    void queryClient.invalidateQueries({ queryKey: ['file-shares', ...affectedFiles] });
    if (item.kind === 'folder') void queryClient.invalidateQueries({ queryKey: ['folder-shares', user.id] });
    setDialog(null);
    setNotice({ message: item.kind === 'folder' ? text.folderTrashed : text.fileTrashed });
  }

  return (
    <DriveLayout
      user={user} homeHref={homeHref}
      signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}
      drive={{
        folder, search, onSearch: changeSearch,
        onUpload: canManage ? (trigger) => { setNotice(null); setDialog({ kind: 'upload', trigger }); } : undefined,
        onCreateFolder: canManage ? (trigger) => { setNotice(null); setDialog({ kind: 'create-folder', trigger }); } : undefined,
      }}
    >
      <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
        <h1 className="sr-only">{readOnly ? data?.data.folder?.name : text.myDrive}</h1>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <nav className="min-w-0" aria-label={text.breadcrumb}>
            <ol className="flex flex-wrap items-center gap-1 text-sm font-medium text-gray-800 sm:text-base">
              {!readOnly && (folder === 'root' || canManage) && <li>
                <Link href={homeHref} prefetch={false} aria-current={folder === 'root' ? 'page' : undefined} className="flex min-h-10 items-center gap-1.5 rounded-md px-1 py-1 text-base font-semibold hover:text-primary-800 sm:text-lg">
                  <HomeIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-gray-500" />{text.myDrive}
                </Link>
              </li>}
              {data?.data.breadcrumbs.map((crumb, index) => (
                <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                  {(!readOnly || index > 0) && <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-500" />}
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
        {data?.data.folder?.description && <p data-testid="drive-folder-description" className="max-w-3xl whitespace-pre-wrap text-sm text-gray-700 [overflow-wrap:anywhere]">{data.data.folder.description}</p>}
        {readOnly && <p data-testid="drive-read-only" className="w-fit rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-900">{text.readOnly}</p>}
        <div className={notice ? 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900' : 'sr-only'}>
          <p role="status" data-testid="drive-status">{notice?.message || (query.isFetching ? text.updating : '')}</p>
          {notice?.href && <Link href={notice.href} prefetch={false} data-testid="folder-move-destination" className="rounded-sm font-medium underline">{text.openMoveDestination}</Link>}
        </div>
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
        {checkingAccess && !expired && !error && (
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
                {search ? <p className="text-sm text-gray-600">{text.noResultsDescription}</p> : page === 1 && <p className="text-sm text-gray-600">{readOnly ? text.readOnlyFolderEmpty : text.noFolderItemsDescription}</p>}
                {page > 1 ? (
                  <Link href={driveHref(folder, search, 1, view)} prefetch={false} className="button button-secondary">{text.firstPage}</Link>
                ) : !search && canManage && (
                  <button type="button" data-testid="upload-empty-open" className="button button-primary" onClick={(event) => setDialog({ kind: 'upload', trigger: event.currentTarget })}><ArrowUpTrayIcon className="h-5 w-5" />{text.upload}</button>
                )}
              </div>
            )}
            <DriveItems title={text.folders} items={folders} view={view} canManage={canManage} onRename={openRename} onTrash={openTrash} onShare={openShare} onFolderRename={openFolderRename} onMove={openMove} />
            <DriveItems title={text.files} items={files} view={view} canManage={canManage} onRename={openRename} onTrash={openTrash} onShare={openShare} onFolderRename={openFolderRename} onMove={openMove} />
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
          setNotice({ message: text.fileRenamed });
        }} />
      )}
      {dialog?.kind === 'trash' && (
        <TrashDialog item={dialog.item} suspended={expired} trigger={dialog.trigger} onDismiss={() => setDialog(null)} onExpired={onExpired} onMoved={onTrashed} focusAfterMove={() => {
          const neighbor = nextTrashFocus.current ? document.getElementById(nextTrashFocus.current) : null;
          (neighbor ?? document.getElementById('drive-main'))?.focus();
        }} />
      )}
      {dialog?.kind === 'share' && (
        <ShareDialog item={dialog.item} itemLink={dialog.itemLink} trigger={dialog.trigger} userId={user.id} suspended={expired} onDismiss={() => setDialog(null)} onExpired={onExpired} />
      )}
      {(dialog?.kind === 'create-folder' || dialog?.kind === 'rename-folder') && (
        <FolderNameDialog folder={dialog.kind === 'rename-folder' ? dialog.folder : undefined} parent={folder} trigger={dialog.trigger} suspended={expired}
          onDismiss={() => setDialog(null)} onExpired={onExpired} onSaved={async (savedFolder) => {
            await refreshFolderLists();
            const message = dialog.kind === 'rename-folder'
              ? (savedFolder.name === dialog.folder.name ? text.folderInfoSaved : text.folderRenamed)
              : text.folderCreated;
            setNotice({ message });
          }} />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog item={dialog.item} userId={user.id} trigger={dialog.trigger} suspended={expired} onDismiss={() => setDialog(null)} onExpired={onExpired} onMoved={onItemMoved} focusAfterMove={() => {
          const neighbor = nextMoveFocus.current ? document.getElementById(nextMoveFocus.current) : null;
          (neighbor ?? document.getElementById('drive-main'))?.focus();
        }} />
      )}
    </DriveLayout>
  );
}
