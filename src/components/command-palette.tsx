'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpTrayIcon,
  ClockIcon,
  FolderIcon,
  FolderPlusIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  RectangleStackIcon,
  ShareIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  SunIcon,
  TrashIcon,
  UserCircleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ComponentType, type SVGProps, useEffect, useMemo, useRef, useState } from 'react';
import { searchDrive } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { folderIconClasses, getFileIcon } from '@/lib/file-icons';
import { driveHref, driveSearchHref, fileHref } from '@/lib/routes';
import { useLocale, useTheme } from './providers';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type PaletteEntry = {
  id: string;
  group: string;
  label: string;
  hint: string;
  Icon: IconComponent;
  iconClasses: string;
  run: () => void;
};

type Props = {
  open: boolean;
  userId: string;
  isAdmin: boolean;
  onDismiss: () => void;
  onOpenShortcuts: () => void;
  onCreateFolder?: () => void;
  onUpload?: () => void;
  onToggleView?: () => void;
};

export function CommandPalette(props: Props) {
  if (!props.open) return null;
  return <CommandPaletteBody {...props} />;
}

function CommandPaletteBody({ userId, isAdmin, onDismiss, onOpenShortcuts, onCreateFolder, onUpload, onToggleView }: Props) {
  const { locale, text } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const vi = locale === 'vi';
  const [rawInput, setRawInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const composing = useRef(false);
  const timer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function scheduleQuery(next: string) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (composing.current) return;
    const trimmed = next.trim();
    const clean = trimmed.startsWith('>') ? '' : trimmed;
    timer.current = window.setTimeout(() => {
      setDebouncedQuery(clean);
    }, 220);
  }

  const searchEnabled = debouncedQuery.length >= 1;
  const searchQuery = useQuery({
    queryKey: ['palette-search', userId, debouncedQuery],
    queryFn: ({ signal }) => searchDrive({ q: debouncedQuery, includeMetadata: true, type: 'all', sort: 'newest', page: 1 }, signal),
    enabled: searchEnabled,
    staleTime: 15_000,
  });

  const entries = useMemo<PaletteEntry[]>(() => {
    const trimmed = rawInput.trim();
    const commandsOnly = trimmed.startsWith('>');
    const needle = trimmed.replace(/^>\s*/, '').toLowerCase();
    const commandGroup = vi ? 'Lệnh nhanh & Điều hướng' : 'Quick actions & Navigation';
    const itemGroup = vi ? 'Kết quả trong Drive' : 'Matches in Drive';

    const commands: PaletteEntry[] = [
      ...(onCreateFolder
        ? [{
            id: 'cmd-new-folder',
            group: commandGroup,
            label: text.createFolder,
            hint: 'Shift+N',
            Icon: FolderPlusIcon,
            iconClasses: 'bg-primary-50 text-primary-700 dark:bg-primary-900/60 dark:text-primary-300',
            run: () => { onDismiss(); onCreateFolder(); },
          }]
        : []),
      ...(onUpload
        ? [{
            id: 'cmd-upload',
            group: commandGroup,
            label: text.upload,
            hint: 'U',
            Icon: ArrowUpTrayIcon,
            iconClasses: 'bg-primary-50 text-primary-700 dark:bg-primary-900/60 dark:text-primary-300',
            run: () => { onDismiss(); onUpload(); },
          }]
        : []),
      ...(onToggleView
        ? [{
            id: 'cmd-toggle-view',
            group: commandGroup,
            label: vi ? 'Đổi chế độ Lưới / Danh sách' : 'Toggle Grid / List view',
            hint: 'V',
            Icon: Squares2X2Icon,
            iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            run: () => { onDismiss(); onToggleView(); },
          }]
        : []),
      {
        id: 'cmd-theme',
        group: commandGroup,
        label: theme === 'dark' ? (vi ? 'Chuyển sang giao diện Sáng' : 'Switch to Light theme') : (vi ? 'Chuyển sang giao diện Tối' : 'Switch to Dark theme'),
        hint: theme === 'dark' ? (vi ? 'Tối' : 'Dark') : (vi ? 'Sáng' : 'Light'),
        Icon: theme === 'dark' ? SunIcon : MoonIcon,
        iconClasses: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
        run: () => { onDismiss(); toggleTheme(); },
      },
      {
        id: 'cmd-shortcuts',
        group: commandGroup,
        label: vi ? 'Xem bảng phím tắt' : 'Show keyboard shortcuts',
        hint: '?',
        Icon: Squares2X2Icon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); onOpenShortcuts(); },
      },
      {
        id: 'nav-drive',
        group: commandGroup,
        label: text.myDrive,
        hint: vi ? 'G rồi D' : 'G then D',
        Icon: FolderIcon,
        iconClasses: folderIconClasses,
        run: () => { onDismiss(); router.push('/drive'); },
      },
      {
        id: 'nav-search',
        group: commandGroup,
        label: text.globalDriveSearch,
        hint: '/drive/search',
        Icon: MagnifyingGlassIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => {
          onDismiss();
          router.push(driveSearchHref({ q: needle, includeMetadata: true, type: 'all', sort: 'name', page: 1 }));
        },
      },
      {
        id: 'nav-timeline',
        group: commandGroup,
        label: text.timeline,
        hint: vi ? 'G rồi T' : 'G then T',
        Icon: ClockIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); router.push('/drive/timeline'); },
      },
      {
        id: 'nav-shared',
        group: commandGroup,
        label: text.sharedWithMe,
        hint: vi ? 'G rồi S' : 'G then S',
        Icon: UserGroupIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); router.push('/shared-with-me'); },
      },
      {
        id: 'nav-outgoing',
        group: commandGroup,
        label: text.sharedByMe,
        hint: vi ? 'G rồi O' : 'G then O',
        Icon: ShareIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); router.push('/shared-by-me'); },
      },
      {
        id: 'nav-boards',
        group: commandGroup,
        label: vi ? 'Bảng của tôi' : 'My boards',
        hint: vi ? 'G rồi B' : 'G then B',
        Icon: RectangleStackIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); router.push('/boards'); },
      },
      {
        id: 'nav-explore',
        group: commandGroup,
        label: vi ? 'Khám phá' : 'Explore',
        hint: '/explore',
        Icon: GlobeAltIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); router.push('/explore'); },
      },
      {
        id: 'nav-trash',
        group: commandGroup,
        label: text.trash,
        hint: vi ? 'G rồi X' : 'G then X',
        Icon: TrashIcon,
        iconClasses: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
        run: () => { onDismiss(); router.push('/trash'); },
      },
      {
        id: 'nav-account',
        group: commandGroup,
        label: text.account,
        hint: '/account',
        Icon: UserCircleIcon,
        iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        run: () => { onDismiss(); router.push('/account'); },
      },
      ...(isAdmin
        ? [{
            id: 'nav-admin',
            group: commandGroup,
            label: text.admin,
            hint: vi ? 'G rồi A' : 'G then A',
            Icon: ShieldCheckIcon,
            iconClasses: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            run: () => { onDismiss(); router.push('/admin'); },
          }]
        : []),
    ].filter((cmd) => !needle || cmd.label.toLowerCase().includes(needle) || cmd.hint.toLowerCase().includes(needle));

    const driveItems: PaletteEntry[] = commandsOnly || !searchEnabled || !searchQuery.data
      ? []
      : searchQuery.data.data.items.slice(0, 8).map(({ item, breadcrumbs }) => {
          const isFolder = item.kind === 'folder';
          const name = isFolder ? item.name : item.originalName;
          const iconMeta = isFolder ? { Icon: FolderIcon, classes: folderIconClasses } : getFileIcon(item.mimeType);
          const locationPath = [text.myDrive, ...breadcrumbs.map((b) => b.name)].join(' / ');
          return {
            id: `drive-${item.kind}-${item.id}`,
            group: itemGroup,
            label: name,
            hint: isFolder ? locationPath : `${readableSize(item.size, locale)} · ${locationPath}`,
            Icon: iconMeta.Icon,
            iconClasses: iconMeta.classes,
            run: () => {
              onDismiss();
              router.push(isFolder ? driveHref(item.id) : fileHref(item.id));
            },
          };
        });

    return [...driveItems, ...commands];
  }, [isAdmin, locale, onCreateFolder, onDismiss, onOpenShortcuts, onToggleView, onUpload, rawInput, router, searchEnabled, searchQuery.data, text, theme, toggleTheme, vi]);

  const safeIndex = entries.length > 0 ? Math.min(activeIndex, entries.length - 1) : 0;

  return (
    <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen) onDismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ux-backdrop-enter fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          data-testid="command-palette"
          aria-label={vi ? 'Tìm nhanh và chạy lệnh' : 'Command Palette'}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="ux-popover-enter fixed inset-x-0 top-[10vh] z-[75] mx-auto flex w-[calc(100%-1.5rem)] max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface-elevated text-ink shadow-2xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">{vi ? 'Command Palette' : 'Command Palette'}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {vi ? 'Tìm kiếm toàn Drive hoặc gõ > để chạy lệnh nhanh.' : 'Search Drive items or type > to run commands.'}
          </Dialog.Description>
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <MagnifyingGlassIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-muted" />
            <input
              ref={inputRef}
              type="text"
              value={rawInput}
              autoComplete="off"
              placeholder={vi ? "Tìm tệp/thư mục trong Drive hoặc gõ '>' chạy lệnh…" : "Search Drive or type '>' for commands…"}
              className="w-full bg-transparent text-base text-ink placeholder:text-ink-muted focus:outline-none sm:text-sm"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRawInput(value);
                setActiveIndex(0);
                scheduleQuery(value);
              }}
              onCompositionStart={() => {
                composing.current = true;
                if (timer.current !== null) window.clearTimeout(timer.current);
              }}
              onCompositionEnd={(event) => {
                composing.current = false;
                scheduleQuery(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  if (entries.length) setActiveIndex((safeIndex + 1) % entries.length);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  if (entries.length) setActiveIndex((safeIndex - 1 + entries.length) % entries.length);
                } else if (event.key === 'Enter' && entries[safeIndex]) {
                  event.preventDefault();
                  entries[safeIndex].run();
                }
              }}
            />
            <kbd className="kbd-chip">Esc</kbd>
          </div>
          <div className="max-h-[55vh] overflow-y-auto ux-scroll-contain p-2">
            {searchEnabled && searchQuery.isFetching && (
              <p className="px-3 py-2 text-xs text-ink-muted">{text.loading}</p>
            )}
            {entries.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">{text.noDriveSearchResults}</p>
            ) : (
              entries.map((entry, idx) => {
                const showGroup = idx === 0 || entries[idx - 1]?.group !== entry.group;
                const active = idx === safeIndex;
                return (
                  <div key={entry.id}>
                    {showGroup && (
                      <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                        {entry.group}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={entry.run}
                      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-accent-soft text-accent-text'
                          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink'
                      }`}
                    >
                      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${entry.iconClasses}`}>
                        <entry.Icon aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 break-words font-medium leading-snug">{entry.label}</span>
                      <span className={`mt-0.5 max-w-[11rem] shrink-0 truncate text-xs ${active ? 'text-accent-text/90' : 'text-ink-muted'}`} title={entry.hint}>
                        {entry.hint}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
