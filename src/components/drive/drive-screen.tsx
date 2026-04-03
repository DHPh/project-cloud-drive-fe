'use client';

import { ArrowUpTrayIcon, ChevronLeftIcon, ChevronRightIcon, FolderIcon, HomeIcon, ListBulletIcon, Squares2X2Icon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, downloadUrl, listFolder, trashFile, trashFolder, type FileItem, type FolderItem, type FolderSummary, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { driveHref, driveSearchHref, fileHref, pageNumber, type DriveView } from '@/lib/routes';
import { useAccountSession } from '../account-session';
import { Overlay } from '../overlay';
import { useLocale, useToast } from '../providers';
import { QuickPreviewDialog } from '../quick-preview-dialog';
import { DriveContextMenu, type ContextMenuState } from './drive-context-menu';
import { DriveItems } from './drive-items';
import { DriveLayout } from './drive-layout';
import { FolderArchiveDownload } from './folder-archive-download';
import { MoveDialog } from './folder-move-dialog';
import { FolderNameDialog } from './folder-name-dialog';
import { RenameDialog } from './rename-dialog';
import { ShareDialog } from './share-dialog';
import { TrashDialog } from './trash-dialog';
import { UploadDialog } from './upload-dialog';

type ActiveDialog =
  | { kind: 'upload'; trigger: HTMLElement | null; initialFiles?: File[] }
  | { kind: 'create-folder'; trigger: HTMLElement | null }
  | { kind: 'rename'; file: FileItem; trigger: HTMLElement }
  | { kind: 'trash'; item: FolderItem; trigger: HTMLElement }
  | { kind: 'share'; item: FolderItem; itemLink: string; trigger: HTMLElement }
  | { kind: 'rename-folder'; folder: FolderSummary; trigger: HTMLElement; descriptionOnly?: boolean }
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
  const pushToast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const vi = locale === 'vi';

  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [notice, setNotice] = useState<{ message: string; href?: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [osDragging, setOsDragging] = useState(false);
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false);
  const [bulkTrashPending, setBulkTrashPending] = useState(false);
  const [bulkTrashError, setBulkTrashError] = useState<string | null>(null);

  const nextTrashFocus = useRef<string | null>(null);
  const nextMoveFocus = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const bulkCancelRef = useRef<HTMLButtonElement>(null);

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

  const toggleView = useCallback(() => {
    window.history.replaceState(null, '', driveHref(folder, search, page, view === 'grid' ? 'list' : 'grid'));
  }, [folder, page, search, view]);

  const checkingAccess = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const data = query.error || checkingAccess || expired ? undefined : query.data;
  const canManage = data?.data.access === 'owner';
  const readOnly = data?.data.access === 'viewer';
  const folderEditor = data?.data.access === 'editor';
  const sharedView = readOnly || folderEditor;
  const canUpload = canManage || folderEditor;
  const allItems = useMemo(() => data?.data.items ?? [], [data]);
  const folders = useMemo(() => allItems.filter((item) => item.kind === 'folder'), [allItems]);
  const files = useMemo(() => allItems.filter((item): item is FileItem => item.kind === 'file'), [allItems]);
  const homeHref = driveHref('root', '', 1, view);
  const error = query.error && (!(query.error instanceof ApiError) || query.error.status !== 401) ? query.error : null;
  const empty = data && allItems.length === 0 && !query.isPlaceholderData;
  const canGoNext = data && page < data.pagination.totalPages;
  const singleSelectedItem = selectedIds.size === 1 ? allItems.find((entry) => selectedIds.has(entry.id)) ?? null : null;

  const openRename = useCallback((file: FileItem, trigger: HTMLElement) => {
    setNotice(null);
    setDialog({ kind: 'rename', file, trigger });
  }, []);

  const openTrash = useCallback((item: FolderItem, trigger: HTMLElement) => {
    setNotice(null);
    nextTrashFocus.current = null;
    setDialog({ kind: 'trash', item, trigger });
  }, []);

  const openShare = useCallback((item: FolderItem, trigger: HTMLElement) => {
    setNotice(null);
    const href = item.kind === 'folder' ? driveHref(item.id) : fileHref(item.id);
    setDialog({ kind: 'share', item, itemLink: new URL(href, window.location.origin).href, trigger });
  }, []);

  const openFolderRename = useCallback((item: FolderSummary, trigger: HTMLElement, descriptionOnly = false) => {
    setNotice(null);
    setDialog({ kind: 'rename-folder', folder: item, trigger, descriptionOnly });
  }, []);

  const openMove = useCallback((item: FolderItem, trigger: HTMLElement) => {
    setNotice(null);
    nextMoveFocus.current = null;
    setDialog({ kind: 'move', item, trigger });
  }, []);

  // Full-screen OS Drag & Drop + Clipboard Ctrl+V Upload
  useEffect(() => {
    if (!canUpload || expired) return;

    function onDragEnter(event: DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) {
        dragDepth.current += 1;
        setOsDragging(true);
      }
    }
    function onDragOver(event: DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    }
    function onDragLeave() {
      if (dragDepth.current > 0) dragDepth.current -= 1;
      if (dragDepth.current === 0) setOsDragging(false);
    }
    function onDrop(event: DragEvent) {
      if (event.dataTransfer?.files?.length) {
        event.preventDefault();
        dragDepth.current = 0;
        setOsDragging(false);
        const dropped = Array.from(event.dataTransfer.files);
        setDialog({ kind: 'upload', trigger: document.getElementById('drive-main'), initialFiles: dropped });
      }
    }
    function onPaste(event: ClipboardEvent) {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const pasted = event.clipboardData?.files ? Array.from(event.clipboardData.files) : [];
      if (pasted.length > 0) {
        event.preventDefault();
        setDialog({ kind: 'upload', trigger: document.getElementById('drive-main'), initialFiles: pasted });
      }
    }

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [canUpload, expired]);

  // Drive-scoped keyboard shortcuts
  useEffect(() => {
    if (expired) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      const mod = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();

      if (event.key === 'Escape' && selectedIds.size > 0) {
        event.preventDefault();
        setSelectedIds(new Set());
        return;
      }

      if (mod && lower === 'a' && allItems.length > 0) {
        event.preventDefault();
        setSelectedIds(new Set(allItems.map((entry) => entry.id)));
        return;
      }

      if (event.shiftKey && lower === 'n' && canManage) {
        event.preventDefault();
        setNotice(null);
        setDialog({ kind: 'create-folder', trigger: document.getElementById('drive-main') });
        return;
      }

      if (lower === 'u' && !mod && canUpload) {
        event.preventDefault();
        setNotice(null);
        setDialog({ kind: 'upload', trigger: document.getElementById('drive-main') });
        return;
      }

      if (lower === 'v' && !mod && !event.shiftKey) {
        event.preventDefault();
        toggleView();
        return;
      }

      if (selectedIds.size === 0) return;
      const firstId = Array.from(selectedIds)[0];
      const selectedItem = allItems.find((entry) => entry.id === firstId);
      if (!selectedItem) return;
      const anchor = document.getElementById('drive-main') ?? document.body;

      if (event.key === ' ' && selectedItem.kind === 'file') {
        event.preventDefault();
        setPreviewFileId(selectedItem.id);
      } else if (event.key === 'F2') {
        if (selectedItem.kind === 'folder' && canManage) {
          event.preventDefault();
          openFolderRename(selectedItem, anchor);
        } else if (selectedItem.kind === 'file' && (canManage || folderEditor)) {
          event.preventDefault();
          openRename(selectedItem, anchor);
        }
      } else if (event.key === 'Delete' && canManage) {
        event.preventDefault();
        if (selectedIds.size > 1) setBulkTrashOpen(true);
        else openTrash(selectedItem, anchor);
      } else if (lower === 's' && !mod && canManage) {
        event.preventDefault();
        openShare(selectedItem, anchor);
      } else if (lower === 'm' && !mod && canManage) {
        event.preventDefault();
        openMove(selectedItem, anchor);
      } else if (lower === 'd' && !mod && selectedItem.kind === 'file') {
        event.preventDefault();
        const link = document.createElement('a');
        link.href = downloadUrl(selectedItem.id);
        link.download = selectedItem.originalName;
        link.click();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [allItems, canManage, canUpload, expired, folderEditor, openFolderRename, openMove, openRename, openShare, openTrash, selectedIds, toggleView]);

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
    const message = item.kind === 'folder' ? text.folderMoved : text.fileMoved;
    const href = driveHref(target ?? 'root', '', 1, view);
    setNotice({ message, href });
    pushToast({ message, href, hrefLabel: text.openMoveDestination });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
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
    void queryClient.invalidateQueries({ queryKey: ['account', user.id] });
    const affectedFiles = item.kind === 'folder' ? [user.id] : [user.id, item.id];
    void queryClient.invalidateQueries({ queryKey: ['file', ...affectedFiles] });
    void queryClient.invalidateQueries({ queryKey: ['file-shares', ...affectedFiles] });
    if (item.kind === 'folder') void queryClient.invalidateQueries({ queryKey: ['folder-shares', user.id] });
    setDialog(null);
    const message = item.kind === 'folder' ? text.folderTrashed : text.fileTrashed;
    setNotice({ message });
    pushToast({ message, href: '/trash', hrefLabel: text.trash });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  async function runBulkTrash() {
    if (bulkTrashPending) return;
    const targets = allItems.filter((entry) => selectedIds.has(entry.id));
    if (targets.length === 0) {
      setBulkTrashOpen(false);
      return;
    }
    setBulkTrashPending(true);
    setBulkTrashError(null);
    const controller = new AbortController();
    let trashedCount = 0;
    try {
      for (const item of targets) {
        if (item.kind === 'folder') await trashFolder(item.id, controller.signal);
        else await trashFile(item.id, controller.signal);
        trashedCount += 1;
      }
      await Promise.all([
        refreshFolderLists(),
        queryClient.invalidateQueries({ queryKey: ['trash', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['account', user.id] }),
      ]);
      setSelectedIds(new Set());
      setBulkTrashOpen(false);
      const message = vi ? `Đã đưa ${trashedCount} mục vào thùng rác.` : `Moved ${trashedCount} items to Trash.`;
      setNotice({ message });
      pushToast({ message, href: '/trash', hrefLabel: text.trash });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        setBulkTrashOpen(false);
        onExpired();
      } else {
        setBulkTrashError(localizedError(failure, text));
        if (trashedCount > 0) void refreshFolderLists();
      }
    } finally {
      setBulkTrashPending(false);
    }
  }

  function handleSelectItem(item: FolderItem, event: MouseEvent<HTMLElement>) {
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      setSelectedIds(new Set([item.id]));
    }
  }

  function handleToggleCheck(item: FolderItem) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  return (
    <DriveLayout
      user={user}
      homeHref={homeHref}
      signingOut={signingOut}
      signOutError={signOutError}
      onSignOut={() => void signOut()}
      drive={{
        folder,
        search,
        onSearch: changeSearch,
        onToggleView: toggleView,
        onUpload: canUpload ? (trigger) => { setNotice(null); setDialog({ kind: 'upload', trigger }); } : undefined,
        onCreateFolder: canManage ? (trigger) => { setNotice(null); setDialog({ kind: 'create-folder', trigger }); } : undefined,
      }}
    >
      <div
        className="mx-auto max-w-screen-2xl space-y-5 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24"
        onContextMenu={(event) => {
          if (!canManage && !canUpload) return;
          if ((event.target as HTMLElement).closest('[data-testid="drive-item"]')) return;
          event.preventDefault();
          setContextMenu({ kind: 'canvas', x: event.clientX, y: event.clientY });
        }}
      >
        <h1 className="sr-only">{sharedView ? data?.data.folder?.name : text.myDrive}</h1>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <nav className="min-w-0" aria-label={text.breadcrumb}>
            <ol className="flex flex-wrap items-center gap-1 text-sm font-medium text-slate-800 dark:text-slate-200 sm:text-base">
              {!sharedView && (folder === 'root' || canManage) && (
                <li>
                  <Link
                    href={homeHref}
                    prefetch={false}
                    aria-current={folder === 'root' ? 'page' : undefined}
                    className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1 text-base font-semibold hover:bg-slate-100 hover:text-primary-700 dark:hover:bg-slate-800 dark:hover:text-primary-300 sm:text-lg"
                  >
                    <HomeIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
                    {text.myDrive}
                  </Link>
                </li>
              )}
              {data?.data.breadcrumbs.map((crumb, index) => (
                <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                  {(!sharedView || index > 0) && <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />}
                  {crumb.id === folder ? (
                    <span aria-current="page" title={crumb.name} className="max-w-[11rem] truncate px-1 sm:max-w-sm">{crumb.name}</span>
                  ) : (
                    <Link
                      href={driveHref(crumb.id, '', 1, view)}
                      prefetch={false}
                      className="max-w-[11rem] truncate rounded-lg px-2 py-1.5 hover:bg-slate-100 hover:text-primary-700 dark:hover:bg-slate-800 dark:hover:text-primary-300 sm:max-w-sm"
                      title={crumb.name}
                    >
                      {crumb.name}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div role="group" aria-label={text.display} className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-800">
            <button
              type="button"
              aria-label={text.grid}
              title={`${text.grid} (V)`}
              aria-pressed={view === 'grid'}
              className={`icon-button h-9 w-9 ${view === 'grid' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : ''}`}
              onClick={() => window.history.replaceState(null, '', driveHref(folder, search, page, 'grid'))}
            >
              <Squares2X2Icon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={text.list}
              title={`${text.list} (V)`}
              aria-pressed={view === 'list'}
              className={`icon-button h-9 w-9 ${view === 'list' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : ''}`}
              onClick={() => window.history.replaceState(null, '', driveHref(folder, search, page, 'list'))}
            >
              <ListBulletIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {(canManage || data?.data.folder) && (
          <div className="flex min-w-0 flex-wrap items-start gap-2">
            {canManage && (
              <Link
                data-testid="global-drive-search-open"
                prefetch={false}
                href={driveSearchHref({ q: search, includeMetadata: false, type: 'all', sort: 'name', page: 1 })}
                className="button button-secondary min-h-10"
              >
                {text.globalDriveSearch}
              </Link>
            )}
            {data?.data.folder && <FolderArchiveDownload folder={data.data.folder} onExpired={onExpired} />}
            {folderEditor && data?.data.folder && (
              <button
                type="button"
                data-testid="folder-description-edit"
                className="button button-secondary min-h-10"
                onClick={(event) => { if (data.data.folder) openFolderRename(data.data.folder, event.currentTarget, true); }}
              >
                {text.editFolderDescription}
              </button>
            )}
          </div>
        )}

        {data?.data.folder?.description && (
          <p data-testid="drive-folder-description" className="max-w-3xl whitespace-pre-wrap rounded-lg bg-slate-100/80 px-3 py-2 text-sm text-slate-700 [overflow-wrap:anywhere] dark:bg-slate-800/70 dark:text-slate-300">
            {data.data.folder.description}
          </p>
        )}
        {readOnly && (
          <p data-testid="drive-read-only" className="w-fit rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-900 dark:bg-primary-950/60 dark:text-primary-200">
            {text.readOnly}
          </p>
        )}
        {folderEditor && (
          <div className="space-y-1">
            <p data-testid="drive-editor" className="w-fit rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-900 dark:bg-primary-950/60 dark:text-primary-200">
              {text.editingAccess}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{text.sharedUploadQuota}</p>
          </div>
        )}

        <div className={notice ? 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200' : 'sr-only'}>
          <p role="status" data-testid="drive-status">{notice?.message || (query.isFetching ? text.updating : '')}</p>
          {notice?.href && <Link href={notice.href} prefetch={false} data-testid="folder-move-destination" className="rounded-sm font-medium underline">{text.openMoveDestination}</Link>}
        </div>

        {search && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate rounded-full bg-primary-50 px-3 py-1.5 text-sm text-primary-900 dark:bg-primary-950/60 dark:text-primary-200" title={search}>{search}</span>
            <Link href={driveHref(folder, '', 1, view)} scroll={false} prefetch={false} className="shrink-0 rounded-md text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">{text.clearSearch}</Link>
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            <p>{localizedError(error, text)}</p>
            <button type="button" className="button button-secondary" onClick={() => void query.refetch()}>{text.retry}</button>
          </div>
        )}

        {checkingAccess && !expired && !error && (
          <div role="status" aria-busy="true" className="space-y-4">
            <span className="sr-only">{text.loading}</span>
            <div aria-hidden="true" className={view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(224px,1fr))]' : 'space-y-1.5'}>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className={`motion-safe:animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 ${view === 'grid' ? 'h-[172px]' : 'h-14'}`} />
              ))}
            </div>
          </div>
        )}

        {data && (
          <div aria-busy={query.isFetching} className="relative min-w-0 space-y-6">
            {query.isFetching && !error && (
              <div aria-hidden="true" className="absolute inset-x-0 -top-3 h-0.5 overflow-hidden rounded bg-primary-100 dark:bg-primary-950">
                <div className="ux-indeterminate-bar h-full w-1/3 rounded bg-primary-600" />
              </div>
            )}
            {empty && (
              <div data-testid={search ? 'drive-empty-search' : 'drive-empty-folder'} className="flex flex-col items-center gap-3 py-14 text-center sm:py-20">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 sm:h-36 sm:w-36">
                  <FolderIcon aria-hidden="true" className="h-16 w-16 text-slate-400 dark:text-slate-500" />
                </div>
                <h2 className="mt-2 text-lg font-semibold">
                  {search ? text.noResults : page > 1 ? text.emptyPage : text.noFolderItems}
                </h2>
                {search ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">{text.noResultsDescription}</p>
                ) : page === 1 && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {readOnly ? text.readOnlyFolderEmpty : text.noFolderItemsDescription}
                  </p>
                )}
                {page > 1 ? (
                  <Link href={driveHref(folder, search, 1, view)} prefetch={false} className="button button-secondary">{text.firstPage}</Link>
                ) : !search && canUpload && (
                  <button
                    type="button"
                    data-testid="upload-empty-open"
                    className="button button-primary"
                    onClick={(event) => setDialog({ kind: 'upload', trigger: event.currentTarget })}
                  >
                    <ArrowUpTrayIcon className="h-5 w-5" />
                    {text.upload}
                  </button>
                )}
              </div>
            )}

            <DriveItems
              title={text.folders}
              items={folders}
              view={view}
              canManage={canManage}
              canEditFiles={folderEditor}
              selectedIds={selectedIds}
              onSelect={handleSelectItem}
              onToggleCheck={handleToggleCheck}
              onContextMenu={(item, event) => {
                event.preventDefault();
                setSelectedIds(new Set([item.id]));
                setContextMenu({ kind: 'item', x: event.clientX, y: event.clientY, item });
              }}
              onRename={openRename}
              onTrash={openTrash}
              onShare={openShare}
              onFolderRename={openFolderRename}
              onMove={openMove}
            />
            <DriveItems
              title={text.files}
              items={files}
              view={view}
              canManage={canManage}
              canEditFiles={folderEditor}
              selectedIds={selectedIds}
              onSelect={handleSelectItem}
              onToggleCheck={handleToggleCheck}
              onPreview={(file) => setPreviewFileId(file.id)}
              onContextMenu={(item, event) => {
                event.preventDefault();
                setSelectedIds(new Set([item.id]));
                setContextMenu({ kind: 'item', x: event.clientX, y: event.clientY, item });
              }}
              onRename={openRename}
              onTrash={openTrash}
              onShare={openShare}
              onFolderRename={openFolderRename}
              onMove={openMove}
            />

            {data.pagination.totalPages > 1 && (
              <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                <p className="text-slate-600 dark:text-slate-400">
                  {text.page} {page} / {data.pagination.totalPages} · {new Intl.NumberFormat(locale).format(data.pagination.total)} {text.items}
                </p>
                <div className="flex gap-1">
                  {page > 1 && (
                    <Link href={driveHref(folder, search, page - 1, view)} prefetch={false} data-testid="drive-pagination-prev" aria-label={text.previousPage} title={text.previousPage} className="icon-button">
                      <ChevronLeftIcon className="h-5 w-5" />
                    </Link>
                  )}
                  {canGoNext && (
                    <Link href={driveHref(folder, search, page + 1, view)} prefetch={false} data-testid="drive-pagination-next" aria-label={text.nextPage} title={text.nextPage} className="icon-button">
                      <ChevronRightIcon className="h-5 w-5" />
                    </Link>
                  )}
                </div>
              </nav>
            )}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
          <div
            role="region"
            aria-label={vi ? 'Thao tác hàng loạt' : 'Bulk actions'}
            className="ux-popover-enter pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-sm text-white shadow-2xl backdrop-blur-sm sm:rounded-full sm:py-1.5"
          >
            <span className="whitespace-nowrap px-2 font-semibold tabular-nums">
              {vi ? `Đã chọn ${selectedIds.size} mục` : `${selectedIds.size} selected`}
            </span>
            {singleSelectedItem && canManage && (
              <button
                type="button"
                onClick={(event) => openMove(singleSelectedItem, event.currentTarget)}
                className="whitespace-nowrap rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold hover:bg-slate-700"
              >
                {text.move}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  if (singleSelectedItem) {
                    openTrash(singleSelectedItem, document.getElementById('drive-main') ?? document.body);
                  } else {
                    setBulkTrashError(null);
                    setBulkTrashOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600"
              >
                <TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {text.moveToTrash}
              </button>
            )}
            <button
              type="button"
              aria-label={vi ? 'Bỏ chọn' : 'Clear selection'}
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {osDragging && canUpload && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-primary-600/15 p-6 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary-600 bg-white px-10 py-8 text-center shadow-2xl dark:bg-slate-900">
            <ArrowUpTrayIcon aria-hidden="true" className="mx-auto mb-3 h-10 w-10 text-primary-600" />
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {vi ? 'Thả tệp để tải lên vào thư mục hiện tại' : 'Drop files to upload to the current folder'}
            </p>
          </div>
        </div>
      )}

      <DriveContextMenu
        state={contextMenu}
        canManage={canManage}
        canEditFiles={folderEditor}
        canUpload={canUpload}
        onDismiss={() => setContextMenu(null)}
        onNavigateFolder={(href) => router.push(href)}
        onPreviewFile={(fileId) => setPreviewFileId(fileId)}
        onShare={openShare}
        onRename={(item, trigger) => {
          if (item.kind === 'folder') openFolderRename(item, trigger);
          else openRename(item, trigger);
        }}
        onMove={openMove}
        onTrash={openTrash}
        onCreateFolder={canManage ? (trigger) => setDialog({ kind: 'create-folder', trigger }) : undefined}
        onUpload={canUpload ? (trigger) => setDialog({ kind: 'upload', trigger }) : undefined}
      />

      <QuickPreviewDialog
        files={files}
        fileId={previewFileId}
        onSelectFile={setPreviewFileId}
        onDismiss={() => setPreviewFileId(null)}
        onExpired={onExpired}
      />

      {bulkTrashOpen && (
        <Overlay
          open={!expired}
          title={text.moveToTrash}
          description={vi ? `Đưa ${selectedIds.size} mục đã chọn vào Thùng rác?` : `Move ${selectedIds.size} selected items to Trash?`}
          initialFocus={bulkCancelRef}
          onDismiss={bulkTrashPending ? undefined : () => setBulkTrashOpen(false)}
        >
          <div className="space-y-3 p-5 sm:p-6">
            {bulkTrashError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200">{bulkTrashError}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
            <button ref={bulkCancelRef} type="button" className="button button-secondary" disabled={bulkTrashPending} onClick={() => setBulkTrashOpen(false)}>
              {text.cancel}
            </button>
            <button type="button" className="button button-danger" disabled={bulkTrashPending} onClick={() => void runBulkTrash()}>
              {bulkTrashPending ? text.movingToTrash : text.moveToTrash}
            </button>
          </div>
        </Overlay>
      )}

      {dialog?.kind === 'upload' && (
        <UploadDialog
          folder={folder}
          suspended={expired || (!checkingAccess && !canUpload)}
          sharedOwner={folderEditor}
          trigger={dialog.trigger}
          initialFiles={dialog.initialFiles}
          onDismiss={() => setDialog(null)}
          onSessionExpired={onExpired}
          onUploaded={() => {
            updateList();
            void queryClient.invalidateQueries({ queryKey: ['account', user.id] });
          }}
          onRefresh={async () => (await query.refetch()).isSuccess}
        />
      )}

      {dialog?.kind === 'rename' && (
        <RenameDialog
          file={dialog.file}
          suspended={expired}
          trigger={dialog.trigger}
          onDismiss={() => setDialog(null)}
          onSessionExpired={onExpired}
          onSaved={(file) => {
            queryClient.setQueryData(queryKey, (previous: typeof data) => previous && {
              ...previous,
              data: { ...previous.data, items: previous.data.items.map((item) => item.id === file.id ? file : item) },
            });
            updateList();
            setNotice({ message: text.fileRenamed });
            pushToast({ message: text.fileRenamed });
          }}
        />
      )}

      {dialog?.kind === 'trash' && (
        <TrashDialog
          item={dialog.item}
          suspended={expired}
          trigger={dialog.trigger}
          onDismiss={() => setDialog(null)}
          onExpired={onExpired}
          onMoved={onTrashed}
          focusAfterMove={() => {
            const neighbor = nextTrashFocus.current ? document.getElementById(nextTrashFocus.current) : null;
            (neighbor ?? document.getElementById('drive-main'))?.focus();
          }}
        />
      )}

      {dialog?.kind === 'share' && (
        <ShareDialog
          item={dialog.item}
          itemLink={dialog.itemLink}
          trigger={dialog.trigger}
          userId={user.id}
          suspended={expired}
          onDismiss={() => setDialog(null)}
          onExpired={onExpired}
        />
      )}

      {(dialog?.kind === 'create-folder' || dialog?.kind === 'rename-folder') && (
        <FolderNameDialog
          folder={dialog.kind === 'rename-folder' ? dialog.folder : undefined}
          parent={folder}
          trigger={dialog.trigger}
          suspended={expired || (!checkingAccess && (dialog.kind === 'rename-folder' && dialog.descriptionOnly ? !folderEditor : !canManage))}
          descriptionOnly={dialog.kind === 'rename-folder' && dialog.descriptionOnly}
          onDismiss={() => setDialog(null)}
          onExpired={onExpired}
          onSaved={async (savedFolder) => {
            await refreshFolderLists();
            const message = dialog.kind === 'rename-folder'
              ? (savedFolder.name === dialog.folder.name ? text.folderInfoSaved : text.folderRenamed)
              : text.folderCreated;
            setNotice({ message });
            pushToast({ message });
          }}
        />
      )}

      {dialog?.kind === 'move' && (
        <MoveDialog
          item={dialog.item}
          userId={user.id}
          trigger={dialog.trigger}
          suspended={expired}
          onDismiss={() => setDialog(null)}
          onExpired={onExpired}
          onMoved={onItemMoved}
          focusAfterMove={() => {
            const neighbor = nextMoveFocus.current ? document.getElementById(nextMoveFocus.current) : null;
            (neighbor ?? document.getElementById('drive-main'))?.focus();
          }}
        />
      )}
    </DriveLayout>
  );
}
