'use client';

import { ArrowDownTrayIcon, ArrowRightIcon, DocumentIcon, DocumentTextIcon, FilmIcon, FolderIcon, MusicalNoteIcon, PencilSquareIcon, PhotoIcon, TableCellsIcon, TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { downloadUrl, type FileItem, type FolderItem, type FolderSummary } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { driveHref, fileHref, type DriveView } from '@/lib/routes';
import { useLocale } from '../providers';

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return { Icon: PhotoIcon, classes: 'bg-emerald-100 text-emerald-700' };
  if (mimeType.startsWith('video/')) return { Icon: FilmIcon, classes: 'bg-violet-100 text-violet-700' };
  if (mimeType.startsWith('audio/')) return { Icon: MusicalNoteIcon, classes: 'bg-violet-100 text-violet-700' };
  if (mimeType.includes('pdf')) return { Icon: DocumentTextIcon, classes: 'bg-red-100 text-red-700' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return { Icon: TableCellsIcon, classes: 'bg-emerald-100 text-emerald-700' };
  return { Icon: DocumentIcon, classes: 'bg-primary-100 text-primary-800' };
}

type FileAction = (file: FileItem, trigger: HTMLElement) => void;
type FolderAction = (folder: FolderSummary, trigger: HTMLElement) => void;
type ItemAction = (item: FolderItem, trigger: HTMLElement) => void;
type Props = { title: string; items: FolderItem[]; view: DriveView; canManage: boolean; onRename: FileAction; onTrash: FileAction; onShare: ItemAction; onFolderRename: FolderAction; onMove: ItemAction };

export function DriveItems({ title, items, view, canManage, onRename, onTrash, onShare, onFolderRename, onMove }: Props) {
  const { locale, text } = useLocale();
  if (items.length === 0) return null;
  const grid = view === 'grid';
  const actionsClass = `flex shrink-0 justify-end gap-1 ${grid ? 'rounded-b-lg border-t border-gray-100 bg-gray-50 px-2 py-1' : ''}`;
  const dateFormat = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'medium' });

  return (
    <section aria-label={title}>
      <h2 className="mb-3 px-1 text-sm font-medium text-gray-600">{title}</h2>
      <ul className={grid ? 'grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4' : 'space-y-1.5'}>
        {items.map((item) => {
          const icon = item.kind === 'folder' ? { Icon: FolderIcon, classes: 'bg-amber-50 text-amber-700' } : fileIcon(item.mimeType);
          const name = item.kind === 'folder' ? item.name : item.originalName;
          const nameClass = `text-sm font-medium ${grid ? 'line-clamp-2 break-words' : 'block truncate'}`;
          const listClass = item.kind === 'file' && canManage ? 'flex-col gap-2 p-2 sm:flex-row sm:items-center hover:bg-gray-50' : 'items-center gap-2 p-2 hover:bg-gray-50';
          const details = (
            <div className={grid ? 'flex min-w-0 items-start gap-2.5' : 'flex min-w-0 flex-1 items-center gap-2.5'}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md sm:h-10 sm:w-10 ${icon.classes}`}>
                <icon.Icon aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                {item.kind === 'file' && !canManage
                  ? <Link data-testid="drive-file-link" href={fileHref(item.id)} prefetch={false} className={`${nameClass} rounded-sm text-primary-800 hover:underline`} title={name}>{name}</Link>
                  : <span className={nameClass} title={name}>{name}</span>}
                {item.kind === 'file' && <span className="block text-xs tabular-nums text-gray-600">{readableSize(item.size, locale)}</span>}
              </div>
            </div>
          );
          const updated = grid && (
            <p className="mt-3 text-xs text-gray-600">{text.updated} <time dateTime={item.updatedAt}>{dateFormat.format(new Date(item.updatedAt))}</time></p>
          );

          return (
            <li key={item.id} data-testid="drive-item" data-kind={item.kind} data-item-id={item.id} className={`panel flex min-w-0 rounded-lg transition-colors hover:border-primary-400 ${grid ? 'min-h-[172px] flex-col hover:shadow-md' : listClass}`}>
              {item.kind === 'folder' ? (
                <>
                  <Link href={driveHref(item.id, '', 1, view)} prefetch={false} className={`min-w-0 rounded-md hover:text-primary-800 ${grid ? 'flex flex-1 flex-col px-3 pt-3' : 'flex min-h-10 flex-1 items-center px-1'}`}>
                    {details}
                  </Link>
                  {grid && <div className="border-t border-gray-100 px-3 pb-3">{updated}</div>}
                  {canManage && (
                    <div className={actionsClass}>
                      <button type="button" data-testid="folder-share" className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.share} aria-label={`${text.share}: ${name}`} onClick={(event) => onShare(item, event.currentTarget)}><UserPlusIcon aria-hidden="true" className="h-4 w-4" /></button>
                      <button type="button" data-testid="folder-rename" className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.rename} aria-label={`${text.rename}: ${name}`} onClick={(event) => onFolderRename(item, event.currentTarget)}><PencilSquareIcon aria-hidden="true" className="h-4 w-4" /></button>
                      <button type="button" id={`folder-move-${item.id}`} data-testid="folder-move" className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.move} aria-label={`${text.move}: ${name}`} onClick={(event) => onMove(item, event.currentTarget)}><ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className={`min-w-0 flex-1 ${grid ? 'flex flex-col justify-between p-3' : 'px-1'}`}>
                    {details}{updated}
                  </div>
                  <div className={actionsClass}>
                    {canManage && (
                      <>
                        <button type="button" data-testid="file-share" className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.share} aria-label={`${text.share}: ${name}`} onClick={(event) => onShare(item, event.currentTarget)}><UserPlusIcon aria-hidden="true" className="h-4 w-4" /></button>
                        <button type="button" data-testid="file-rename" className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.rename} aria-label={`${text.rename}: ${name}`} onClick={(event) => onRename(item, event.currentTarget)}><PencilSquareIcon aria-hidden="true" className="h-4 w-4" /></button>
                        <button type="button" id={`file-move-${item.id}`} data-testid="file-move" className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.move} aria-label={`${text.move}: ${name}`} onClick={(event) => onMove(item, event.currentTarget)}><ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></button>
                      </>
                    )}
                    <a data-testid="file-download" href={downloadUrl(item.id)} download={name} className="icon-button h-11 w-11 sm:h-10 sm:w-8" title={text.download} aria-label={`${text.download}: ${name}`}><ArrowDownTrayIcon className="h-4 w-4" /></a>
                    {canManage && <button id={`drive-trash-${item.id}`} type="button" data-testid="file-trash" className="icon-button h-11 w-11 hover:bg-red-50 hover:text-red-800 sm:h-10 sm:w-8" title={text.moveToTrash} aria-label={`${text.moveToTrash}: ${name}`} onClick={(event) => onTrash(item, event.currentTarget)}><TrashIcon aria-hidden="true" className="h-4 w-4" /></button>}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
