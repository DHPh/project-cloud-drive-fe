'use client';

import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ArrowUpTrayIcon,
  EyeIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { downloadUrl, type FolderItem } from '@/lib/api';
import { driveHref } from '@/lib/routes';
import { useLocale } from '../providers';

export type ContextMenuState =
  | { kind: 'item'; x: number; y: number; item: FolderItem }
  | { kind: 'canvas'; x: number; y: number };

type Props = {
  state: ContextMenuState | null;
  canManage: boolean;
  canEditFiles: boolean;
  canUpload: boolean;
  onDismiss: () => void;
  onNavigateFolder: (folderId: string) => void;
  onPreviewFile: (fileId: string) => void;
  onShare: (item: FolderItem, trigger: HTMLElement) => void;
  onRename: (item: FolderItem, trigger: HTMLElement) => void;
  onMove: (item: FolderItem, trigger: HTMLElement) => void;
  onTrash: (item: FolderItem, trigger: HTMLElement) => void;
  onCreateFolder?: (trigger: HTMLElement) => void;
  onUpload?: (trigger: HTMLElement) => void;
};

export function DriveContextMenu({
  state,
  canManage,
  canEditFiles,
  canUpload,
  onDismiss,
  onNavigateFolder,
  onPreviewFile,
  onShare,
  onRename,
  onMove,
  onTrash,
  onCreateFolder,
  onUpload,
}: Props) {
  const { locale, text } = useLocale();
  const menuRef = useRef<HTMLDivElement>(null);
  const vi = locale === 'vi';

  useEffect(() => {
    if (!state) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onDismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onDismiss, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [onDismiss, state]);

  if (!state || typeof document === 'undefined') return null;

  const menuWidth = 248;
  const approxHeight = state.kind === 'canvas' ? 120 : 280;
  const left = Math.max(8, Math.min(state.x, window.innerWidth - menuWidth - 8));
  const top = Math.max(8, Math.min(state.y, window.innerHeight - approxHeight - 8));

  const itemClass = 'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ left, top, width: menuWidth }}
      className="ux-popover-enter fixed z-[80] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      {state.kind === 'item' ? (
        <>
          {state.item.kind === 'folder' ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                onDismiss();
                onNavigateFolder(driveHref(state.item.id));
              }}
            >
              <FolderOpenIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{vi ? 'Mở thư mục' : 'Open folder'}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">Enter</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                onDismiss();
                onPreviewFile(state.item.id);
              }}
            >
              <EyeIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{vi ? 'Xem nhanh' : 'Quick preview'}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">Space</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={(event) => {
                onDismiss();
                onShare(state.item, event.currentTarget);
              }}
            >
              <UserPlusIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{text.share}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">S</span>
            </button>
          )}
          {(canManage || (state.item.kind === 'file' && canEditFiles)) && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={(event) => {
                onDismiss();
                onRename(state.item, event.currentTarget);
              }}
            >
              <PencilSquareIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{state.item.kind === 'folder' ? text.editFolderInfo : text.rename}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">F2</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={(event) => {
                onDismiss();
                onMove(state.item, event.currentTarget);
              }}
            >
              <ArrowRightIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{text.move}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">M</span>
            </button>
          )}
          {state.item.kind === 'file' && (
            <a
              role="menuitem"
              href={downloadUrl(state.item.id)}
              download={state.item.originalName}
              className={itemClass}
              onClick={onDismiss}
            >
              <ArrowDownTrayIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{text.download}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">D</span>
            </a>
          )}
          {canManage && (
            <>
              <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                onClick={(event) => {
                  onDismiss();
                  onTrash(state.item, event.currentTarget);
                }}
              >
                <TrashIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">{state.item.kind === 'folder' ? text.moveFolderToTrash : text.moveToTrash}</span>
                <span className="mt-0.5 shrink-0 font-mono text-[11px]">Delete</span>
              </button>
            </>
          )}
        </>
      ) : (
        <>
          {canManage && onCreateFolder && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={(event) => {
                onDismiss();
                onCreateFolder(event.currentTarget);
              }}
            >
              <FolderPlusIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{text.createFolder}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">Shift+N</span>
            </button>
          )}
          {canUpload && onUpload && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={(event) => {
                onDismiss();
                onUpload(event.currentTarget);
              }}
            >
              <ArrowUpTrayIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="flex-1">{text.upload}</span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-400">U</span>
            </button>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
