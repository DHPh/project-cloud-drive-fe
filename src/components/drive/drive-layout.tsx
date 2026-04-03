'use client';

import {
  ArrowLeftOnRectangleIcon,
  ArrowUpTrayIcon,
  Bars3Icon,
  ClockIcon,
  FolderIcon,
  FolderPlusIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  RectangleStackIcon,
  ShareIcon,
  ShieldCheckIcon,
  SunIcon,
  TrashIcon,
  UserCircleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@/lib/api';
import { BrandIcon } from '../brand';
import { CommandPalette } from '../command-palette';
import { LanguageSwitch } from '../language-switch';
import { Overlay } from '../overlay';
import { useLocale, useTheme } from '../providers';
import { ShortcutsDialog } from '../shortcuts-dialog';
import { StorageQuotaWidget } from '../storage-quota-widget';
import { useGlobalShortcuts } from '../use-global-shortcuts';

type SearchProps = { search: string; onSearch: (search: string) => void };

export function DriveSearch({ search, onSearch, label, testId = 'drive-search' }: SearchProps & { label?: string; testId?: string }) {
  const { text } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const lastSubmitted = useRef<string | null>(null);

  useEffect(() => {
    if (input.current && lastSubmitted.current !== search) input.current.value = search;
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [search]);

  function schedule(value: string, immediate = false) {
    if (timer.current !== null) clearTimeout(timer.current);
    if (composing.current) return;
    const commit = () => {
      const query = value.trim();
      lastSubmitted.current = query;
      onSearch(query);
    };
    if (immediate) commit();
    else timer.current = setTimeout(commit, 300);
  }

  return (
    <form className="relative flex w-full max-w-2xl items-center" role="search" onSubmit={(event) => { event.preventDefault(); schedule(input.current?.value ?? '', true); }}>
      <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
      <input
        ref={input}
        data-testid={testId}
        type="search"
        name="q"
        autoComplete="off"
        maxLength={255}
        defaultValue={search}
        className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-600 focus:border-primary-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 sm:h-10 sm:text-sm"
        placeholder={label ?? text.searchPlaceholder}
        aria-label={label ?? text.search}
        onChange={(event) => schedule(event.currentTarget.value)}
        onCompositionStart={() => { composing.current = true; if (timer.current !== null) clearTimeout(timer.current); }}
        onCompositionEnd={(event) => { composing.current = false; schedule(event.currentTarget.value); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
        }}
      />
    </form>
  );
}

type Section = 'drive' | 'trash' | 'shared' | 'outgoing' | 'file' | 'search' | 'timeline' | 'account' | 'admin' | 'boards';

type Props = {
  user: User;
  homeHref?: string;
  section?: Section;
  drive?: SearchProps & {
    folder: string;
    onUpload?: (trigger: HTMLElement | null) => void;
    onCreateFolder?: (trigger: HTMLElement | null) => void;
    onToggleView?: () => void;
  };
  signingOut: boolean;
  signOutError: string | null;
  onSignOut: () => void;
  children: ReactNode;
};

type NavItem = {
  id: string;
  href: string;
  label: string;
  Icon: typeof FolderIcon;
  chord?: string;
  testId?: string;
};

function NavigationLinks({ active, homeHref, admin, mobile = false, onNavigate }: { active: Section; homeHref: string; admin: boolean; mobile?: boolean; onNavigate?: () => void }) {
  const { text, locale } = useLocale();
  const vi = locale === 'vi';

  const groups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: vi ? 'Lưu trữ' : 'Storage',
      items: [
        { id: 'drive', href: homeHref, label: text.myDrive, Icon: FolderIcon, chord: vi ? 'G rồi D' : 'G then D' },
        { id: 'timeline', href: '/drive/timeline', label: text.timeline, Icon: ClockIcon, chord: vi ? 'G rồi T' : 'G then T', testId: mobile ? 'timeline-nav-mobile' : 'timeline-nav' },
        { id: 'trash', href: '/trash', label: text.trash, Icon: TrashIcon, chord: vi ? 'G rồi X' : 'G then X', testId: mobile ? 'trash-nav-mobile' : 'trash-nav' },
      ],
    },
    {
      title: vi ? 'Chia sẻ' : 'Sharing',
      items: [
        { id: 'shared', href: '/shared-with-me', label: text.sharedWithMe, Icon: UserGroupIcon, chord: vi ? 'G rồi S' : 'G then S', testId: mobile ? 'shared-nav-mobile' : 'shared-nav' },
        { id: 'outgoing', href: '/shared-by-me', label: text.sharedByMe, Icon: ShareIcon, chord: vi ? 'G rồi O' : 'G then O', testId: mobile ? 'outgoing-nav-mobile' : 'outgoing-nav' },
      ],
    },
    {
      title: vi ? 'Công khai' : 'Public',
      items: [
        { id: 'boards', href: '/boards', label: vi ? 'Bảng của tôi' : 'My boards', Icon: RectangleStackIcon, chord: vi ? 'G rồi B' : 'G then B' },
        { id: 'explore', href: '/explore', label: vi ? 'Khám phá' : 'Explore', Icon: GlobeAltIcon },
      ],
    },
    {
      title: vi ? 'Hệ thống' : 'System',
      items: [
        { id: 'account', href: '/account', label: text.account, Icon: UserCircleIcon, testId: mobile ? 'account-nav-mobile' : 'account-nav' },
        ...(admin ? [{ id: 'admin', href: '/admin', label: text.admin, Icon: ShieldCheckIcon, chord: vi ? 'G rồi A' : 'G then A', testId: mobile ? 'admin-nav-mobile' : 'admin-nav' }] : []),
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-1 px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ id, href, label, Icon, chord, testId }) => (
              <Link
                key={id}
                href={href}
                prefetch={false}
                onNavigate={onNavigate}
                data-testid={testId}
                aria-current={id === active ? 'page' : undefined}
                className={`group flex min-h-10 items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium leading-snug transition-colors ${
                  id === active
                    ? 'bg-primary-50 text-primary-800 dark:bg-primary-500/20 dark:text-primary-200'
                    : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{label}</span>
                {chord && (
                  <span aria-hidden="true" className="mt-0.5 shrink-0 whitespace-nowrap font-mono text-[10px] text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-400">
                    {chord}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DriveLayout({ user, drive, homeHref = '/drive', section = drive ? 'drive' : 'trash', signingOut, signOutError, onSignOut, children }: Props) {
  const { locale, text } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const vi = locale === 'vi';
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [profileMenuPos, setProfileMenuPos] = useState<{ right: number; top: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsTrigger, setShortcutsTrigger] = useState<HTMLElement | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggleNavigation = useRef<HTMLButtonElement>(null);
  const newTrigger = useRef<HTMLButtonElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const shortcutTrigger = useRef<HTMLButtonElement>(null);

  const mainId = `${section}-main`;
  const showDriveActions = Boolean(drive?.onCreateFolder || drive?.onUpload);
  const initials = (user.name.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('') || user.email[0] || '?').toUpperCase();

  const openPalette = useCallback(() => {
    setNewMenuPos(null);
    setProfileMenuPos(null);
    setPaletteOpen(true);
  }, []);

  const openShortcuts = useCallback(() => {
    setNewMenuPos(null);
    setProfileMenuPos(null);
    setShortcutsTrigger(shortcutTrigger.current);
    setShortcutsOpen(true);
  }, []);

  useGlobalShortcuts({
    isAdmin: user.role === 'admin',
    onOpenPalette: openPalette,
    onOpenShortcuts: openShortcuts,
  });

  useEffect(() => {
    if (!newMenuPos && !profileMenuPos) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        const wasNew = Boolean(newMenuPos);
        setNewMenuPos(null);
        setProfileMenuPos(null);
        if (wasNew) newTrigger.current?.focus();
        else profileTrigger.current?.focus();
      }
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (newMenuPos && !newMenuRef.current?.contains(target) && !newTrigger.current?.contains(target)) {
        setNewMenuPos(null);
      }
      if (profileMenuPos && !profileMenuRef.current?.contains(target) && !profileTrigger.current?.contains(target)) {
        setProfileMenuPos(null);
      }
    }
    function onScrollOrResize() {
      setNewMenuPos(null);
      setProfileMenuPos(null);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [newMenuPos, profileMenuPos]);

  function toggleNewMenu() {
    if (newMenuPos) {
      setNewMenuPos(null);
      return;
    }
    setProfileMenuPos(null);
    const rect = newTrigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 264;
    setNewMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.min(rect.bottom + 6, window.innerHeight - 130),
    });
  }

  function toggleProfileMenu() {
    if (profileMenuPos) {
      setProfileMenuPos(null);
      return;
    }
    setNewMenuPos(null);
    const rect = profileTrigger.current?.getBoundingClientRect();
    if (!rect) return;
    setProfileMenuPos({
      right: Math.max(8, window.innerWidth - rect.right),
      top: Math.min(rect.bottom + 8, window.innerHeight - 260),
    });
  }

  function startDriveAction(action: 'onUpload' | 'onCreateFolder') {
    setNewMenuPos(null);
    drive?.[action]?.(newTrigger.current);
  }

  return (
    <div className="safe-top min-h-dvh bg-slate-50 dark:bg-slate-950 lg:grid lg:min-h-dvh lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:grid-rows-[4rem_1fr]">
      <a href={`#${mainId}`} className="sr-only z-[60] focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900">
        {text.skip}
      </a>

      <header className="sticky top-0 z-30 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 sm:h-16 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0 lg:col-span-2">
        <div className="order-1 flex shrink-0 items-center gap-1.5 sm:gap-2.5 lg:w-[14rem]">
          <button type="button" ref={toggleNavigation} className="icon-button h-9 w-9 sm:h-10 sm:w-10 lg:hidden" aria-label={text.openNavigation} onClick={() => setNavigationOpen(true)}>
            <Bars3Icon className="h-6 w-6" />
          </button>

          <Link href={homeHref} prefetch={false} className="flex shrink-0 items-center gap-2 rounded-md text-slate-900 dark:text-slate-100">
            <BrandIcon />
            <span className="text-base font-bold tracking-tight sm:text-lg">{text.app}</span>
          </Link>
        </div>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-1 sm:order-3 sm:ml-0 sm:gap-1.5">
          <button
            ref={shortcutTrigger}
            type="button"
            onClick={openShortcuts}
            className="icon-button hidden sm:inline-flex"
            aria-label={vi ? 'Phím tắt & Macro' : 'Keyboard shortcuts'}
            title={vi ? 'Phím tắt (?)' : 'Shortcuts (?)'}
          >
            <span className="font-mono text-sm font-bold">?</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="icon-button h-9 w-9 sm:h-10 sm:w-10"
            aria-label={theme === 'dark' ? (vi ? 'Chuyển giao diện sáng' : 'Switch to light mode') : (vi ? 'Chuyển giao diện tối' : 'Switch to dark mode')}
            title={theme === 'dark' ? (vi ? 'Giao diện sáng' : 'Light mode') : (vi ? 'Giao diện tối' : 'Dark mode')}
          >
            {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
          <LanguageSwitch />
          <button
            ref={profileTrigger}
            type="button"
            onClick={toggleProfileMenu}
            aria-expanded={Boolean(profileMenuPos)}
            aria-haspopup="menu"
            aria-label={`${initials} — ${text.account}: ${user.name || user.email}`}
            title={user.name || user.email}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-xs font-bold text-white shadow-sm ring-2 ring-white hover:opacity-95 dark:ring-slate-900 sm:h-9 sm:w-9"
          >
            <span>{initials}</span>
          </button>
          <button
            type="button"
            data-testid="logout"
            disabled={signingOut}
            onClick={onSignOut}
            className="icon-button h-9 w-9 shrink-0 sm:h-10 sm:w-10"
            aria-label={signingOut ? text.signOutPending : text.signOut}
            title={text.signOut}
          >
            <ArrowLeftOnRectangleIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-2 sm:w-auto sm:flex-1">
          {drive ? (
            <>
              <DriveSearch key={drive.folder} search={drive.search} onSearch={drive.onSearch} />
              <button
                type="button"
                onClick={openPalette}
                title={vi ? 'Mở Command Palette (Ctrl+K)' : 'Open Command Palette (Ctrl+K)'}
                className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 md:inline-flex"
              >
                <span>{vi ? 'Lệnh' : 'Cmd'}</span>
                <kbd className="kbd-chip">Ctrl+K</kbd>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={openPalette}
              className="flex h-10 w-full max-w-md items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-left text-sm text-slate-600 shadow-sm hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <MagnifyingGlassIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{vi ? 'Tìm trong Drive hoặc chạy lệnh…' : 'Search Drive or run a command…'}</span>
              <kbd className="kbd-chip hidden sm:inline-flex">Ctrl+K</kbd>
            </button>
          )}
        </div>
      </header>

      <aside className={`min-w-0 overflow-x-hidden overflow-y-auto bg-slate-50 px-3 pt-3 dark:bg-slate-950 lg:pt-4 ${showDriveActions ? '' : 'hidden lg:block'}`}>
        {drive?.onCreateFolder && (
          <div className="mb-4">
            <button
              ref={newTrigger}
              type="button"
              data-testid="drive-new"
              aria-expanded={Boolean(newMenuPos)}
              aria-haspopup="menu"
              onClick={toggleNewMenu}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 lg:justify-start"
            >
              <PlusIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>{text.newItem}</span>
            </button>
          </div>
        )}
        {drive?.onUpload && !drive.onCreateFolder && (
          <button
            type="button"
            data-testid="upload-open"
            className="button button-primary mb-4 min-h-11 w-full"
            onClick={(event) => drive.onUpload?.(event.currentTarget)}
          >
            <ArrowUpTrayIcon aria-hidden="true" className="h-5 w-5" />
            {text.upload}
          </button>
        )}
        <nav aria-label={text.navigation} className="hidden lg:block">
          <NavigationLinks active={section} homeHref={homeHref} admin={user.role === 'admin'} />
          <StorageQuotaWidget userId={user.id} />
        </nav>
      </aside>

      <Overlay
        open={navigationOpen}
        title={text.navigation}
        description={text.app}
        onDismiss={() => setNavigationOpen(false)}
        restoreFallback={() => toggleNavigation.current?.focus()}
      >
        <nav aria-label={text.navigation} className="overflow-y-auto ux-scroll-contain p-4">
          <NavigationLinks active={section} homeHref={homeHref} admin={user.role === 'admin'} mobile onNavigate={() => setNavigationOpen(false)} />
          <StorageQuotaWidget userId={user.id} />
        </nav>
      </Overlay>

      <main id={mainId} tabIndex={-1} className="safe-bottom min-w-0 bg-white dark:bg-slate-900 lg:m-0 lg:min-h-[calc(100dvh-4rem)] lg:rounded-tl-2xl lg:border-l lg:border-t lg:border-slate-200 dark:lg:border-slate-800">
        {signOutError && (
          <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
            {signOutError}
          </p>
        )}
        {children}
      </main>

      {newMenuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={newMenuRef}
          role="menu"
          style={{ left: newMenuPos.left, top: newMenuPos.top, width: 264 }}
          className="ux-popover-enter fixed z-[75] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="folder-create-open"
            className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => startDriveAction('onCreateFolder')}
          >
            <FolderPlusIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-400" />
            <span className="flex-1">{text.createFolder}</span>
            <span aria-hidden="true" className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-400">Shift+N</span>
          </button>
          {drive?.onUpload && (
            <button
              type="button"
              role="menuitem"
              data-testid="upload-open"
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => startDriveAction('onUpload')}
            >
              <ArrowUpTrayIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-600 dark:text-slate-400" />
              <span className="flex-1">{text.upload}</span>
              <span aria-hidden="true" className="mt-0.5 shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-400">U</span>
            </button>
          )}
        </div>,
        document.body,
      )}

      {profileMenuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={profileMenuRef}
          role="menu"
          style={{ right: profileMenuPos.right, top: profileMenuPos.top, width: 256 }}
          className="ux-popover-enter fixed z-[75] rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 px-2 pb-2.5 pt-1 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
            <p className="truncate text-xs text-slate-600 dark:text-slate-400">{user.email}</p>
          </div>
          <div className="mt-1.5 space-y-0.5">
            <Link
              href="/account"
              prefetch={false}
              role="menuitem"
              onClick={() => setProfileMenuPos(null)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <UserCircleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{text.account}</span>
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => { toggleTheme(); setProfileMenuPos(null); }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <SunIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : <MoonIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{theme === 'dark' ? (vi ? 'Giao diện sáng' : 'Light mode') : (vi ? 'Giao diện tối' : 'Dark mode')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setProfileMenuPos(null); openShortcuts(); }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true" className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center font-mono text-xs font-bold">?</span>
              <span className="flex-1">{vi ? 'Phím tắt & Macro' : 'Shortcuts & Macros'}</span>
              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">?</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      <CommandPalette
        open={paletteOpen}
        userId={user.id}
        isAdmin={user.role === 'admin'}
        onDismiss={() => setPaletteOpen(false)}
        onOpenShortcuts={openShortcuts}
        onCreateFolder={drive?.onCreateFolder ? () => drive.onCreateFolder?.(newTrigger.current) : undefined}
        onUpload={drive?.onUpload ? () => drive.onUpload?.(newTrigger.current) : undefined}
        onToggleView={drive?.onToggleView}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        onDismiss={() => setShortcutsOpen(false)}
        restoreFocus={shortcutsTrigger}
      />
    </div>
  );
}
