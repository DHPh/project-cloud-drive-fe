'use client';

import { ChevronRightIcon, FolderIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, listFolder, updateFile, updateFolder, type FolderItem } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type Props = {
  item: FolderItem;
  userId: string;
  trigger: HTMLElement;
  suspended: boolean;
  onDismiss: () => void;
  onExpired: () => void;
  onMoved: (item: FolderItem) => void;
  focusAfterMove: () => void;
};

export function MoveDialog({ item, userId, trigger, suspended, onDismiss, onExpired, onMoved, focusAfterMove }: Props) {
  const { text } = useLocale();
  const [destination, setDestination] = useState({ id: 'root', name: '' });
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentHeading = useRef<HTMLHeadingElement>(null);
  const focusDestination = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const moved = useRef(false);
  const query = useQuery({
    queryKey: ['folder-picker', userId, destination.id, page],
    queryFn: ({ signal }) => listFolder(destination.id, '', page, signal, 'folders'),
    enabled: !suspended,
    refetchOnMount: 'always',
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === destination.id ? previous : undefined,
  });
  const data = query.data?.data;
  const pages = query.data?.pagination.totalPages ?? 0;
  const name = item.kind === 'folder' ? item.name : item.originalName;
  const testId = `${item.kind}-move`;
  const currentParent = (item.kind === 'folder' ? item.parentId : item.folderId) ?? 'root';
  const ancestors = data?.breadcrumbs.filter((crumb) => crumb.id !== destination.id) ?? [];
  const forbidden = item.kind === 'folder' && (destination.id === item.id || Boolean(data?.breadcrumbs.some((crumb) => crumb.id === item.id)));
  const sameParent = destination.id === currentParent;
  const available = data?.items.filter((entry) => entry.kind === 'folder').filter((entry) => item.kind !== 'folder' || entry.id !== item.id) ?? [];
  const loading = query.isPending || query.isPlaceholderData;
  const canMove = data?.access === 'owner' && query.isSuccess && !loading && !pending && !suspended && !sameParent && !forbidden;
  const canPage = !loading && !pending;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) onExpired();
  }, [query.error, onExpired]);
  useLayoutEffect(() => {
    if (suspended || focusDestination.current !== destination.id) return;
    focusDestination.current = null;
    currentHeading.current?.focus();
  }, [destination.id, suspended]);

  function browse(id: string, name: string) {
    if (request.current || id === destination.id) return;
    focusDestination.current = id;
    setDestination({ id, name });
    setPage(1);
    setError(null);
  }

  function turnPage(next: number) {
    if (!canPage || request.current || next < 1 || next > pages) return;
    setPage(next);
  }

  function dismiss() {
    if (!request.current) onDismiss();
  }

  async function submit() {
    if (!canMove || request.current || moved.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setPending(true);
    try {
      const target = destination.id === 'root' ? null : destination.id;
      const updated = item.kind === 'folder'
        ? await updateFolder(item.id, { parentId: target }, controller.signal)
        : await updateFile(item.id, { folderId: target }, controller.signal);
      if (controller.signal.aborted) return;
      moved.current = true;
      onMoved(updated);
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(localizedError(failure, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay
      open={!suspended} testId={`${testId}-dialog`} title={item.kind === 'folder' ? text.moveFolder : text.moveFile} description={item.kind === 'folder' ? text.moveFolderDescription : text.moveFileDescription}
      onDismiss={pending ? undefined : dismiss} initialFocus={currentHeading}
      restoreFallback={() => {
        if (moved.current || !trigger.isConnected) focusAfterMove();
        else trigger.focus();
      }}
    >
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <p className="break-words text-sm font-semibold" title={name}>{name}</p>
        {destination.id !== 'root' && (
          <nav aria-label={text.breadcrumb}>
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              <li><button type="button" data-testid="move-picker-root" className="min-h-11 rounded-md px-2 text-primary-800 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/15" disabled={pending} onClick={() => browse('root', '')}>{text.myDrive}</button></li>
              {ancestors.map((crumb) => (
                <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                  <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                  <button type="button" data-testid="move-picker-ancestor" data-folder-id={crumb.id} className="min-h-11 min-w-0 truncate rounded-md px-2 text-primary-800 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/15" title={crumb.name} disabled={pending} onClick={() => browse(crumb.id, crumb.name)}>{crumb.name}</button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h3 ref={currentHeading} tabIndex={-1} data-testid="move-picker-current" data-folder-id={destination.id} className="break-words rounded-md text-sm font-medium text-slate-900 dark:text-slate-100">
          {destination.id === 'root' ? text.myDrive : data?.folder?.name ?? destination.name}
        </h3>
        {loading && !suspended && <p role="status" data-testid="move-picker-loading" className="text-sm text-slate-600 dark:text-slate-400">{text.loading}</p>}
        {query.isError && !suspended && (
          <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
            <p>{localizedError(query.error, text)}</p>
            <button type="button" data-testid="move-picker-retry" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
          </div>
        )}
        {forbidden && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{text.invalidFolderMove}</p>}
        {query.isSuccess && !loading && !forbidden && available.length === 0 && <p data-testid="move-picker-empty" className="text-sm text-slate-600 dark:text-slate-400">{text.movePickerEmpty}</p>}
        {query.isSuccess && !loading && !forbidden && available.length > 0 && (
          <ul aria-busy={query.isFetching} className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {available.map((option) => (
              <li key={option.id}>
                <button type="button" data-testid="move-picker-folder" data-folder-id={option.id} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  title={option.name} disabled={pending} onClick={() => browse(option.id, option.name)}>
                  <FolderIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /><span className="min-w-0 flex-1 break-words">{option.name}</span><ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && !forbidden && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>{text.page} {page} / {pages}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="move-picker-prev" className="button button-secondary aria-disabled:cursor-not-allowed aria-disabled:opacity-60" aria-disabled={!canPage || page <= 1} onClick={() => turnPage(page - 1)}>{text.previousPage}</button>
              <button type="button" data-testid="move-picker-next" className="button button-secondary aria-disabled:cursor-not-allowed aria-disabled:opacity-60" aria-disabled={!canPage || page >= pages} onClick={() => turnPage(page + 1)}>{text.nextPage}</button>
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t border-line px-5 py-4 sm:px-6">
        {error && <p data-testid={`${testId}-error`} role="alert" className="text-sm text-danger">{error}</p>}
        {sameParent && <p className="text-sm text-ink-secondary">{item.kind === 'folder' ? text.sameFolderParent : text.sameFileParent}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" data-testid={`${testId}-cancel`} className="button button-secondary min-h-11" disabled={pending} onClick={dismiss}>{text.cancel}</button>
          <button type="button" data-testid={`${testId}-submit`} className="button button-primary min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-60" aria-disabled={!canMove} aria-busy={pending} onClick={() => void submit()}>
            {pending ? text.movingFolder : text.moveHere}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
