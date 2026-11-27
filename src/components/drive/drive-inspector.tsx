'use client';

import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  FolderIcon,
  FolderOpenIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  downloadUrl,
  getFilePreview,
  listItemShares,
  updateFile,
  updateFolder,
  type FileItem,
  type FolderItem,
  type FolderSummary,
} from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { folderIconClasses, getFileIcon } from '@/lib/file-icons';
import { localizedError } from '@/lib/messages';
import { driveHref, fileHref, type DriveView } from '@/lib/routes';
import { shareDateFormat } from '@/lib/share-expiry';
import { useLocale, useToast } from '../providers';

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  view: DriveView;
  folderName: string;
  folderDescription?: string | null;
  totalItems: number;
  selectedItems: FolderItem[];
  canManage: boolean;
  canEditFiles: boolean;
  expired: boolean;
  onExpired: () => void;
  onPreview: (file: FileItem) => void;
  onShare: (item: FolderItem, trigger: HTMLElement) => void;
  onRename: (file: FileItem, trigger: HTMLElement) => void;
  onFolderRename: (folder: FolderSummary, trigger: HTMLElement) => void;
  onMove: (item: FolderItem, trigger: HTMLElement) => void;
  onTrash: (item: FolderItem, trigger: HTMLElement) => void;
  onItemUpdated: () => void;
};

const PREVIEWABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;

function InspectorThumbnail({ file }: { file: FileItem }) {
  const iconMeta = getFileIcon(file.mimeType);
  const canLoadThumb = PREVIEWABLE_IMAGE_TYPES.has(file.mimeType.toLowerCase()) && file.size <= MAX_THUMBNAIL_BYTES;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!canLoadThumb) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void getFilePreview(file.id, controller.signal)
      .then((res) => res.blob())
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canLoadThumb, file.id]);

  if (thumbUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- Authenticated blob URL preview */
      <img src={thumbUrl} alt={file.originalName} className="h-full w-full object-cover" />
    );
  }

  return (
    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ${iconMeta.classes}`}>
      <iconMeta.Icon aria-hidden="true" className="h-7 w-7" />
    </span>
  );
}

function SingleItemInspector({
  item,
  userId,
  view,
  canManage,
  canEditFiles,
  expired,
  onClose,
  onExpired,
  onPreview,
  onShare,
  onRename,
  onFolderRename,
  onMove,
  onTrash,
  onItemUpdated,
}: {
  item: FolderItem;
  userId: string;
  view: DriveView;
  canManage: boolean;
  canEditFiles: boolean;
  expired: boolean;
  onClose: () => void;
  onExpired: () => void;
  onPreview: (file: FileItem) => void;
  onShare: (item: FolderItem, trigger: HTMLElement) => void;
  onRename: (file: FileItem, trigger: HTMLElement) => void;
  onFolderRename: (folder: FolderSummary, trigger: HTMLElement) => void;
  onMove: (item: FolderItem, trigger: HTMLElement) => void;
  onTrash: (item: FolderItem, trigger: HTMLElement) => void;
  onItemUpdated: () => void;
}) {
  const { locale, text } = useLocale();
  const pushToast = useToast();
  const vi = locale === 'vi';
  const isFile = item.kind === 'file';
  const itemName = isFile ? item.originalName : item.name;
  const canEditItem = canManage || (isFile && canEditFiles);

  const serverDesc = item.description ?? '';
  const [descDraft, setDescDraft] = useState(serverDesc);
  const [descDirty, setDescDirty] = useState(false);
  const [descSaving, setDescSaving] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);

  const [tagInput, setTagInput] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  const currentDescription = descDirty ? descDraft : serverDesc;
  const descriptionChanged = currentDescription !== serverDesc;

  const sharesQuery = useQuery({
    queryKey: ['inspector-shares', userId, item.kind, item.id],
    queryFn: ({ signal }) => listItemShares(item, 1, signal),
    enabled: canManage && !expired,
    staleTime: 30_000,
  });

  const dateFormat = shareDateFormat(locale);
  const iconMeta = isFile ? getFileIcon(item.mimeType) : { Icon: FolderIcon, classes: folderIconClasses, tint: '' };

  async function saveDescription() {
    if (!canEditItem || descSaving || !descriptionChanged) return;
    if ([...currentDescription].length > 2000) {
      setDescError(text.descriptionTooLong);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setDescSaving(true);
    setDescError(null);
    try {
      const nextValue = currentDescription || null;
      if (isFile) {
        await updateFile(item.id, { description: nextValue }, controller.signal);
      } else {
        await updateFolder(item.id, { description: nextValue }, controller.signal);
      }
      if (controller.signal.aborted) return;
      setDescDirty(false);
      pushToast({ message: isFile ? text.fileMetadataSaved : text.folderInfoSaved });
      onItemUpdated();
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setDescError(localizedError(failure, text));
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) setDescSaving(false);
    }
  }

  async function saveTags(nextTags: string[]) {
    if (!isFile || !canEditItem || tagSaving) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTagSaving(true);
    setTagError(null);
    try {
      await updateFile(item.id, { tags: nextTags }, controller.signal);
      if (controller.signal.aborted) return;
      setTagInput('');
      pushToast({ message: text.fileMetadataSaved });
      onItemUpdated();
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setTagError(localizedError(failure, text));
    } finally {
      requestRef.current = null;
      if (!controller.signal.aborted) setTagSaving(false);
    }
  }

  function handleAddTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFile || tagSaving) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if ([...trimmed].length > 64) {
      setTagError(text.fileTagTooLong);
      return;
    }
    if (item.tags.includes(trimmed)) {
      setTagError(text.fileTagDuplicate);
      return;
    }
    if (item.tags.length >= 20) {
      setTagError(text.fileTagLimitReached);
      return;
    }
    void saveTags([...item.tags, trimmed]);
  }

  const grants = sharesQuery.data?.data.items ?? [];

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconMeta.classes}`}>
            <iconMeta.Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <h2 className="truncate text-sm font-semibold text-ink" title={itemName}>
            {itemName}
          </h2>
        </div>
        <button
          type="button"
          data-testid="inspector-close"
          onClick={onClose}
          aria-label={text.close}
          className="icon-button h-7 w-7"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {isFile && (
        <button
          type="button"
          onClick={() => onPreview(item)}
          title={text.quickPreview}
          className={`group relative flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-canvas bg-gradient-to-br ${iconMeta.tint} transition hover:border-line-strong`}
        >
          <InspectorThumbnail file={item} />
          <span className="absolute bottom-2 right-2 rounded-md border border-line bg-surface-canvas/90 px-2 py-0.5 text-[11px] font-semibold text-ink opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {text.quickPreview}
          </span>
        </button>
      )}

      <div className="flex flex-wrap gap-1.5">
        {isFile ? (
          <>
            <button
              type="button"
              data-testid="inspector-preview"
              onClick={() => onPreview(item)}
              className="button button-primary min-h-9 flex-1 px-3 text-xs"
            >
              <EyeIcon aria-hidden="true" className="h-4 w-4" />
              {text.quickPreview}
            </button>
            <a
              data-testid="inspector-download"
              href={downloadUrl(item.id)}
              download={item.originalName}
              aria-label={`${text.download}: ${item.originalName}`}
              title={text.download}
              className="button button-secondary min-h-9 px-2.5 text-xs"
            >
              <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
            </a>
            <Link
              href={fileHref(item.id)}
              prefetch={false}
              aria-label={`${text.fileDetails}: ${item.originalName}`}
              title={text.fileDetails}
              className="button button-secondary min-h-9 px-2.5 text-xs"
            >
              <ArrowTopRightOnSquareIcon aria-hidden="true" className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <>
            <Link
              href={driveHref(item.id, '', 1, view)}
              prefetch={false}
              className="button button-primary min-h-9 flex-1 px-3 text-xs"
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
              {vi ? 'Mở thư mục' : 'Open folder'}
            </Link>
            {canManage && (
              <button
                type="button"
                data-testid="inspector-share"
                onClick={(event) => onShare(item, event.currentTarget)}
                className="button button-secondary min-h-9 px-3 text-xs"
              >
                <UserPlusIcon aria-hidden="true" className="h-4 w-4" />
                {text.share}
              </button>
            )}
          </>
        )}
      </div>

      <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-2 gap-y-1.5 rounded-xl border border-line bg-surface-canvas p-3 text-xs">
        <dt className="text-ink-muted">{text.fileType}</dt>
        <dd className="break-all font-medium text-ink">{isFile ? item.mimeType : text.folder}</dd>
        {isFile && (
          <>
            <dt className="text-ink-muted">{text.fileSize}</dt>
            <dd className="font-medium tabular-nums text-ink">{readableSize(item.size, locale)}</dd>
          </>
        )}
        <dt className="text-ink-muted">{text.updated}</dt>
        <dd className="text-ink">{dateFormat.format(new Date(item.updatedAt))}</dd>
      </dl>

      <div className="space-y-1.5">
        <label htmlFor="inspector-description" className="block text-xs font-semibold text-ink-secondary">
          {text.fileDescription}
        </label>
        {canEditItem ? (
          <>
            <textarea
              id="inspector-description"
              data-testid="inspector-description"
              rows={3}
              maxLength={4000}
              value={currentDescription}
              readOnly={descSaving}
              placeholder={vi ? 'Thêm ghi chú…' : 'Add a description…'}
              onChange={(event) => {
                setDescDraft(event.currentTarget.value);
                setDescDirty(true);
                setDescError(null);
              }}
              className="field min-h-[76px] resize-y text-xs"
            />
            {descError && <p role="alert" className="text-xs text-danger">{descError}</p>}
            {descriptionChanged && (
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  disabled={descSaving}
                  onClick={() => {
                    setDescDraft(serverDesc);
                    setDescDirty(false);
                    setDescError(null);
                  }}
                  className="button button-secondary min-h-8 px-2.5 text-xs"
                >
                  {text.cancel}
                </button>
                <button
                  type="button"
                  disabled={descSaving}
                  onClick={() => void saveDescription()}
                  className="button button-primary min-h-8 px-2.5 text-xs"
                >
                  {descSaving ? text.saving : text.saveDescription}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface-canvas px-3 py-2 text-xs text-ink-secondary [overflow-wrap:anywhere]">
            {item.description || <span className="italic text-ink-muted">{text.noDescriptionYet}</span>}
          </p>
        )}
      </div>

      {isFile && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-secondary">{text.fileTags}</p>
          {item.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-canvas px-2.5 py-0.5 text-xs text-ink"
                >
                  <span className="truncate">{tag}</span>
                  {canEditItem && (
                    <button
                      type="button"
                      disabled={tagSaving}
                      aria-label={`${text.removeFileTag} ${tag}`}
                      onClick={() => void saveTags(item.tags.filter((value) => value !== tag))}
                      className="text-ink-muted hover:text-danger disabled:opacity-50"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-ink-muted">{text.noTagsYet}</p>
          )}
          {canEditItem && (
            <form onSubmit={handleAddTag} className="flex gap-1.5">
              <input
                type="text"
                data-testid="inspector-tag-input"
                value={tagInput}
                maxLength={128}
                readOnly={tagSaving}
                placeholder={vi ? 'Thêm thẻ rồi Enter…' : 'Add tag and press Enter…'}
                onChange={(event) => {
                  setTagInput(event.currentTarget.value);
                  setTagError(null);
                }}
                className="field min-h-8 min-w-0 flex-1 px-2.5 py-1 text-xs"
              />
              <button
                type="submit"
                disabled={tagSaving || !tagInput.trim()}
                className="button button-secondary min-h-8 px-2.5 text-xs"
              >
                {vi ? 'Thêm' : 'Add'}
              </button>
            </form>
          )}
          {tagError && <p role="alert" className="text-xs text-danger">{tagError}</p>}
        </div>
      )}

      {canManage && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-semibold text-ink-secondary">
              {text.shareRecipients} ({sharesQuery.data?.pagination.total ?? grants.length})
            </span>
            <button
              type="button"
              data-testid="inspector-share"
              onClick={(event) => onShare(item, event.currentTarget)}
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent-text hover:underline"
            >
              {text.manageShares}
            </button>
          </div>
          {sharesQuery.isPending ? (
            <div className="h-12 animate-pulse rounded-lg border border-line bg-surface-canvas" />
          ) : grants.length > 0 ? (
            <ul className="space-y-1.5">
              {grants.slice(0, 3).map((grant) => (
                <li key={grant.recipientId} className="rounded-lg border border-line bg-surface-canvas px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="truncate font-semibold text-ink">{grant.recipientName}</span>
                    <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10.5px] font-medium text-ink-secondary">
                      {grant.access === 'editor' ? text.editingAccess : text.readOnly}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-ink-muted">{grant.recipientEmail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-muted">{text.noShareRecipients}</p>
          )}
        </div>
      )}

      {(canManage || canEditItem) && (
        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line pt-3">
          {canManage && (
            <button
              type="button"
              data-testid="inspector-move"
              onClick={(event) => onMove(item, event.currentTarget)}
              className="button button-secondary min-h-9 flex-1 px-2.5 text-xs"
            >
              <ArrowRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {text.move}
            </button>
          )}
          {canEditItem && (
            <button
              type="button"
              data-testid="inspector-rename"
              onClick={(event) => {
                if (isFile) onRename(item, event.currentTarget);
                else onFolderRename(item, event.currentTarget);
              }}
              className="button button-secondary min-h-9 flex-1 px-2.5 text-xs"
            >
              <PencilSquareIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {text.rename}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              data-testid="inspector-trash"
              onClick={(event) => onTrash(item, event.currentTarget)}
              className="button button-secondary min-h-9 flex-1 px-2.5 text-xs text-danger hover:bg-danger-soft"
            >
              <TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {vi ? 'Xóa' : 'Trash'}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function DriveInspector({
  open,
  onClose,
  userId,
  view,
  folderName,
  folderDescription,
  totalItems,
  selectedItems,
  canManage,
  canEditFiles,
  expired,
  onExpired,
  onPreview,
  onShare,
  onRename,
  onFolderRename,
  onMove,
  onTrash,
  onItemUpdated,
}: Props) {
  const { locale, text } = useLocale();
  const vi = locale === 'vi';

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (window.innerWidth >= 1024) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const singleItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const selectedFolderCount = selectedItems.filter((item) => item.kind === 'folder').length;
  const selectedFileCount = selectedItems.length - selectedFolderCount;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 top-14 z-30 bg-slate-950/45 backdrop-blur-[1px] lg:hidden"
      />
      <aside
        data-testid="drive-inspector"
        aria-label={text.inspectorTitle}
        className="ux-scroll-contain fixed bottom-0 right-0 top-14 z-40 flex w-[min(320px,100vw)] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-surface-rail p-4 shadow-2xl lg:static lg:z-auto lg:h-full lg:w-[304px] lg:shadow-none xl:w-[320px]"
      >
        {!singleItem && selectedItems.length === 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">{text.inspectorTitle}</h2>
              <button
                type="button"
                data-testid="inspector-close"
                onClick={onClose}
                aria-label={text.close}
                className="icon-button h-7 w-7"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 rounded-xl border border-line bg-surface-canvas p-3.5">
              <div className="flex items-center gap-2.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${folderIconClasses}`}>
                  <FolderIcon aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink" title={folderName}>{folderName}</p>
                  <p className="text-xs text-ink-muted">
                    {new Intl.NumberFormat(locale).format(totalItems)} {text.items}
                  </p>
                </div>
              </div>
              {folderDescription && (
                <p className="whitespace-pre-wrap text-xs text-ink-secondary [overflow-wrap:anywhere]">
                  {folderDescription}
                </p>
              )}
            </div>
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-muted">
              {text.inspectorEmptyHint}
            </p>
          </>
        )}

        {!singleItem && selectedItems.length > 1 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                {vi ? `Đã chọn ${selectedItems.length} mục` : `${selectedItems.length} selected`}
              </h2>
              <button
                type="button"
                data-testid="inspector-close"
                onClick={onClose}
                aria-label={text.close}
                className="icon-button h-7 w-7"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 rounded-xl border border-line bg-surface-canvas p-3.5 text-xs text-ink-secondary">
              {selectedFolderCount > 0 && (
                <p>{selectedFolderCount} {text.folders.toLowerCase()}</p>
              )}
              {selectedFileCount > 0 && (
                <p>{selectedFileCount} {text.files.toLowerCase()}</p>
              )}
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">{text.inspectorMultiHint}</p>
          </>
        )}

        {singleItem && (
          <SingleItemInspector
            key={singleItem.id}
            item={singleItem}
            userId={userId}
            view={view}
            canManage={canManage}
            canEditFiles={canEditFiles}
            expired={expired}
            onClose={onClose}
            onExpired={onExpired}
            onPreview={onPreview}
            onShare={onShare}
            onRename={onRename}
            onFolderRename={onFolderRename}
            onMove={onMove}
            onTrash={onTrash}
            onItemUpdated={onItemUpdated}
          />
        )}
      </aside>
    </>
  );
}
