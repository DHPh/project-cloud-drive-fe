'use client';

import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  CheckIcon,
  EyeIcon,
  FolderIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { type MouseEvent } from 'react';
import { downloadUrl, type FileItem, type FolderItem, type FolderSummary } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { folderIconClasses, getFileIcon } from '@/lib/file-icons';
import { driveHref, fileHref, type DriveView } from '@/lib/routes';
import { useLocale } from '../providers';

type FileAction = (file: FileItem, trigger: HTMLElement) => void;
type FolderAction = (folder: FolderSummary, trigger: HTMLElement) => void;
type ItemAction = (item: FolderItem, trigger: HTMLElement) => void;

type Props = {
  title: string;
  items: FolderItem[];
  view: DriveView;
  canManage: boolean;
  canEditFiles?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (item: FolderItem, event: MouseEvent<HTMLElement>) => void;
  onToggleCheck?: (item: FolderItem) => void;
  onPreview?: (file: FileItem) => void;
  onContextMenu?: (item: FolderItem, event: MouseEvent<HTMLElement>) => void;
  onRename: FileAction;
  onTrash: ItemAction;
  onShare: ItemAction;
  onFolderRename: FolderAction;
  onMove: ItemAction;
};

export function DriveItems({
  title,
  items,
  view,
  canManage,
  canEditFiles = false,
  selectedIds,
  onSelect,
  onToggleCheck,
  onPreview,
  onContextMenu,
  onRename,
  onTrash,
  onShare,
  onFolderRename,
  onMove,
}: Props) {
  const { locale, text } = useLocale();
  if (items.length === 0) return null;

  const grid = view === 'grid';
  const isFolderSection = items[0]?.kind === 'folder';
  const dateFormat = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium' });
  const hasAnySelection = Boolean(selectedIds && selectedIds.size > 0);
  const vi = locale === 'vi';

  const actionButtons = (item: FolderItem, name: string) => (
    <div
      className={`ux-hover-reveal flex shrink-0 items-center justify-end gap-0.5 transition-opacity ${
        grid
          ? 'sm:opacity-70 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
          : 'sm:opacity-70 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
      }`}
    >
      {item.kind === 'file' && onPreview && (
        <button
          type="button"
          className={`icon-button ${grid ? 'h-8 w-8 sm:h-7 sm:w-7' : 'h-9 w-9 sm:h-8 sm:w-8'}`}
          title={vi ? 'Xem nhanh (Space)' : 'Quick preview (Space)'}
          aria-label={`${vi ? 'Xem nhanh' : 'Preview'}: ${name}`}
          onClick={(event) => { event.stopPropagation(); onPreview(item); }}
        >
          <EyeIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      {canManage && (
        <button
          type="button"
          data-testid={item.kind === 'folder' ? 'folder-share' : 'file-share'}
          className={`icon-button ${grid ? 'h-8 w-8 sm:h-7 sm:w-7' : 'h-9 w-9 sm:h-8 sm:w-8'}`}
          title={text.share}
          aria-label={`${text.share}: ${name}`}
          onClick={(event) => { event.stopPropagation(); onShare(item, event.currentTarget); }}
        >
          <UserPlusIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      {(canManage || (item.kind === 'file' && canEditFiles)) && (
        <button
          type="button"
          data-testid={item.kind === 'folder' ? 'folder-rename' : 'file-rename'}
          className={`icon-button ${grid ? 'h-8 w-8 sm:h-7 sm:w-7' : 'h-9 w-9 sm:h-8 sm:w-8'}`}
          title={item.kind === 'folder' ? text.editFolderInfo : text.rename}
          aria-label={item.kind === 'folder' ? `${text.editFolderInfo} ${name}` : `${text.rename}: ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            if (item.kind === 'folder') onFolderRename(item, event.currentTarget);
            else onRename(item, event.currentTarget);
          }}
        >
          <PencilSquareIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      {canManage && (
        <button
          type="button"
          id={`${item.kind}-move-${item.id}`}
          data-testid={item.kind === 'folder' ? 'folder-move' : 'file-move'}
          className={`icon-button ${grid ? 'h-8 w-8 sm:h-7 sm:w-7' : 'h-9 w-9 sm:h-8 sm:w-8'}`}
          title={text.move}
          aria-label={`${text.move}: ${name}`}
          onClick={(event) => { event.stopPropagation(); onMove(item, event.currentTarget); }}
        >
          <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      {item.kind === 'file' && (
        <a
          data-testid="file-download"
          href={downloadUrl(item.id)}
          download={name}
          onClick={(event) => event.stopPropagation()}
          className={`icon-button ${grid ? 'h-8 w-8 sm:h-7 sm:w-7' : 'h-9 w-9 sm:h-8 sm:w-8'}`}
          title={text.download}
          aria-label={`${text.download}: ${name}`}
        >
          <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
        </a>
      )}
      {canManage && (
        <button
          type="button"
          id={`drive-trash-${item.kind}-${item.id}`}
          data-testid={item.kind === 'folder' ? 'folder-trash' : 'file-trash'}
          className={`icon-button hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/60 dark:hover:text-red-400 ${grid ? 'h-8 w-8 sm:h-7 sm:w-7' : 'h-9 w-9 sm:h-8 sm:w-8'}`}
          title={item.kind === 'folder' ? text.moveFolderToTrash : text.moveToTrash}
          aria-label={`${item.kind === 'folder' ? text.moveFolderToTrash : text.moveToTrash}: ${name}`}
          onClick={(event) => { event.stopPropagation(); onTrash(item, event.currentTarget); }}
        >
          <TrashIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (!grid) {
    return (
      <section aria-label={title} className="space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
          {title} ({items.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-line bg-surface-elevated shadow-sm">
          <div className="hidden grid-cols-[auto_minmax(0,1fr)_88px_132px_auto] items-center gap-3 border-b border-line bg-surface-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted sm:grid">
            <span className="w-6" aria-hidden="true" />
            <span>{vi ? 'Tên' : 'Name'}</span>
            <span>{text.fileSize}</span>
            <span>{text.updated}</span>
            <span className="text-right">{vi ? 'Thao tác' : 'Actions'}</span>
          </div>
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const icon = item.kind === 'folder' ? { Icon: FolderIcon, classes: folderIconClasses } : getFileIcon(item.mimeType);
              const name = item.kind === 'folder' ? item.name : item.originalName;
              const isSelected = Boolean(selectedIds?.has(item.id));
              return (
                <li
                  key={item.id}
                  data-testid="drive-item"
                  data-kind={item.kind}
                  data-item-id={item.id}
                  onClick={(event) => onSelect?.(item, event)}
                  onContextMenu={(event) => onContextMenu?.(item, event)}
                  className={`group flex flex-col gap-2 px-3 py-2.5 transition-colors sm:grid sm:grid-cols-[auto_minmax(0,1fr)_88px_132px_auto] sm:items-center sm:gap-3 ${
                    isSelected
                      ? 'bg-surface-selected'
                      : 'hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5 sm:contents">
                    {onToggleCheck ? (
                      <button
                        type="button"
                        aria-label={`${vi ? 'Chọn' : 'Select'} ${name}`}
                        aria-pressed={isSelected}
                        onClick={(event) => { event.stopPropagation(); onToggleCheck(item); }}
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent text-white'
                            : 'border-line-strong bg-surface-canvas text-transparent hover:border-ink-muted'
                        }`}
                      >
                        <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="hidden w-6 sm:inline-block" aria-hidden="true" />
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${icon.classes}`}>
                        <icon.Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {item.kind === 'file' ? (
                          <Link
                            data-testid="drive-file-link"
                            href={fileHref(item.id)}
                            prefetch={false}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate rounded-sm text-sm font-medium text-accent-text hover:underline"
                            title={name}
                          >
                            {name}
                          </Link>
                        ) : (
                          <Link
                            href={driveHref(item.id, '', 1, view)}
                            prefetch={false}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate rounded-sm text-sm font-medium text-ink hover:text-accent-text hover:underline"
                            title={name}
                          >
                            {name}
                          </Link>
                        )}
                        <p className="text-xs text-ink-muted sm:hidden">
                          {item.kind === 'file' ? `${readableSize(item.size, locale)} · ` : ''}
                          {dateFormat.format(new Date(item.updatedAt))}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="hidden text-xs tabular-nums text-ink-muted sm:block">
                    {item.kind === 'file' ? readableSize(item.size, locale) : '—'}
                  </span>
                  <time dateTime={item.updatedAt} className="hidden text-xs text-ink-muted sm:block">
                    {dateFormat.format(new Date(item.updatedAt))}
                  </time>
                  <div className="flex justify-end">{actionButtons(item, name)}</div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={title} className="space-y-2.5">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {title} ({items.length})
      </h2>
      <ul
        className={
          isFolderSection
            ? 'grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(236px,1fr))]'
            : 'grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(224px,1fr))]'
        }
      >
        {items.map((item) => {
          const isSelected = Boolean(selectedIds?.has(item.id));
          if (item.kind === 'folder') {
            return (
              <li
                key={item.id}
                data-testid="drive-item"
                data-kind="folder"
                data-item-id={item.id}
                onClick={(event) => onSelect?.(item, event)}
                onContextMenu={(event) => onContextMenu?.(item, event)}
                className={`panel group relative flex min-w-0 flex-col gap-2 px-3.5 py-2.5 transition-all ${
                  isSelected
                    ? 'border-accent bg-surface-selected ring-1 ring-accent'
                    : 'hover:border-line-strong hover:bg-surface-hover'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-opacity ${folderIconClasses} ${
                        onToggleCheck && (isSelected || hasAnySelection)
                          ? 'opacity-15'
                          : onToggleCheck
                            ? 'group-hover:opacity-15'
                            : ''
                      }`}
                    >
                      <FolderIcon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    {onToggleCheck && (
                      <button
                        type="button"
                        aria-label={`${vi ? 'Chọn' : 'Select'} ${item.name}`}
                        aria-pressed={isSelected}
                        onClick={(event) => { event.stopPropagation(); onToggleCheck(item); }}
                        className={`ux-hover-reveal absolute inset-0 m-auto inline-flex h-6 w-6 items-center justify-center rounded-md border transition-opacity ${
                          isSelected
                            ? 'border-accent bg-accent text-white opacity-100'
                            : hasAnySelection
                              ? 'border-line-strong bg-surface-canvas text-transparent opacity-100'
                              : 'border-line-strong bg-surface-canvas text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                        }`}
                      >
                        <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={driveHref(item.id, '', 1, view)}
                      prefetch={false}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-block max-w-full truncate rounded-sm align-top text-sm font-semibold text-ink hover:text-accent-text hover:underline"
                      title={item.name}
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 truncate whitespace-nowrap text-xs text-ink-muted">
                      <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center justify-end border-t border-line pt-1.5">
                    {actionButtons(item, item.name)}
                  </div>
                )}
              </li>
            );
          }

          const icon = getFileIcon(item.mimeType);
          return (
            <li
              key={item.id}
              data-testid="drive-item"
              data-kind="file"
              data-item-id={item.id}
              onClick={(event) => onSelect?.(item, event)}
              onContextMenu={(event) => onContextMenu?.(item, event)}
              className={`panel group relative flex min-w-0 flex-col overflow-hidden transition-all ${
                isSelected
                  ? 'border-accent bg-surface-selected ring-1 ring-accent'
                  : 'hover:border-line-strong hover:shadow-md'
              }`}
            >
              <div
                onClick={(event) => {
                  if (onPreview) {
                    event.stopPropagation();
                    onPreview(item);
                  }
                }}
                className={`relative flex h-28 items-center justify-center border-b border-line bg-surface-subtle bg-gradient-to-br ${icon.tint} ${onPreview ? 'cursor-pointer' : ''}`}
              >
                {onToggleCheck && (
                  <button
                    type="button"
                    aria-label={`${vi ? 'Chọn' : 'Select'} ${item.originalName}`}
                    aria-pressed={isSelected}
                    onClick={(event) => { event.stopPropagation(); onToggleCheck(item); }}
                    className={`ux-hover-reveal absolute left-2.5 top-2.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition-opacity ${
                      isSelected
                        ? 'border-accent bg-accent text-white opacity-100'
                        : hasAnySelection
                          ? 'border-line-strong bg-surface-canvas text-transparent opacity-100'
                          : 'border-line-strong bg-surface-canvas text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-105 ${icon.classes}`}>
                  <icon.Icon aria-hidden="true" className="h-6 w-6" />
                </span>
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-2.5 p-3">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${icon.classes}`}>
                  <icon.Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    data-testid="drive-file-link"
                    href={fileHref(item.id)}
                    prefetch={false}
                    onClick={(event) => event.stopPropagation()}
                    className="line-clamp-2 break-words rounded-sm text-sm font-semibold text-accent-text hover:underline"
                    title={item.originalName}
                  >
                    {item.originalName}
                  </Link>
                  <p className="mt-1 truncate whitespace-nowrap text-xs tabular-nums text-ink-muted">
                    {readableSize(item.size, locale)} · <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end border-t border-line bg-surface-subtle/60 px-2 py-1">
                {actionButtons(item, item.originalName)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
