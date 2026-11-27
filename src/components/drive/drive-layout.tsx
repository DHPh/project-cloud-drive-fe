'use client';

import {
  ArrowLeftOnRectangleIcon,
  ArrowUpTrayIcon,
  Bars3Icon,
  ChevronDownIcon,
  ClockIcon,
  FolderIcon,
  FolderPlusIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
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
import { Overlay } from '../overlay';
import { useLocale, useTheme } from '../providers';
import { ShortcutsDialog } from '../shortcuts-dialog';
import { StorageQuotaWidget } from '../storage-quota-widget';
import { useGlobalShortcuts } from '../use-global-shortcuts';

type SearchProps = { search: string; onSearch: (search: string) => void };

export function DriveSearch({
  search,
  onSearch,
  label,
  testId = 'drive-search',
  onOpenPalette,
}: SearchProps & { label?: string; testId?: string; onOpenPalette?: () => void }) {
  const { locale, text } = useLocale();
  const vi = locale === 'vi';
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
    <form
      className="flex h-10 w-full max-w-[620px] items-center gap-2 rounded-full border border-line bg-surface-canvas pl-3.5 pr-2 shadow-sm transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft sm:h-9"
      role="search"
      onSubmit={(event) => { event.preventDefault(); schedule(input.current?.value ?? '', true); }}
    >
      <MagnifyingGlassIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
      <input
        ref={input}
        data-testid={testId}
        type="search"
        name="q"
        autoComplete="off"
        maxLength={255}
        defaultValue={search}
        className="w-full min-w-0 bg-transparent text-base text-ink placeholder:text-ink-muted focus:outline-none sm:text-[13.5px]"
        placeholder={label ?? text.searchPlaceholder}
        aria-label={label ?? text.search}
        onChange={(event) => schedule(event.currentTarget.value)}
        onCompositionStart={() => { composing.current = true; if (timer.current !== null) clearTimeout(timer.current); }}
        onCompositionEnd={(event) => { composing.current = false; schedule(event.currentTarget.value); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
        }}
      />
      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          title={vi ? 'Mở Command Palette (Ctrl+K)' : 'Open Command Palette (Ctrl+K)'}
          className="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-surface-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink md:inline-flex"
        >
          <span>{vi ? 'Lệnh' : 'Cmd'}</span>
          <kbd className="font-mono text-[10.5px] font-medium">Ctrl+K</kbd>
        </button>
      )}
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
  rightSidebar?: ReactNode;
  rightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
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
    <div className="space-y-3.5">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
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
                className={`group flex min-h-9 items-start gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] leading-[1.35] transition-colors ${
                  id === active
                    ? 'bg-accent-soft font-semibold text-accent-text'
                    : 'font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink'
                }`}
              >
                <Icon aria-hidden="true" className="mt-[1px] h-[17px] w-[17px] shrink-0" />
                <span className="min-w-0 flex-1 break-words">{label}</span>
                {chord && (
                  <span aria-hidden="true" className="mt-0.5 shrink-0 whitespace-nowrap font-mono text-[10.5px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
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

export function DriveLayout({
  user,
  drive,
  homeHref = '/drive',
  section = drive ? 'drive' : 'trash',
  rightSidebar,
  rightSidebarOpen = false,
  onToggleRightSidebar,
  signingOut,
  signOutError,
  onSignOut,
  children,
}: Props) {
  const { locale, setLocale, text } = useLocale();
  const { theme, setTheme, toggleTheme } = useTheme();
  const vi = locale === 'vi';
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [profileMenuPos, setProfileMenuPos] = useState<{ right: number; top: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsTrigger, setShortcutsTrigger] = useState<HTMLElement | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  const toggleNavigation = useRef<HTMLButtonElement>(null);
  const newTrigger = useRef<HTMLButtonElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const shortcutTrigger = useRef<HTMLButtonElement>(null);
  const signOutCancelRef = useRef<HTMLButtonElement>(null);

  const mainId = `${section}-main`;
  const showDriveActions = Boolean(drive?.onCreateFolder || drive?.onUpload);
  const displayName = user.name || user.email;
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
      top: Math.min(rect.bottom + 8, window.innerHeight - 330),
    });
  }

  function startDriveAction(action: 'onUpload' | 'onCreateFolder') {
    setNewMenuPos(null);
    drive?.[action]?.(newTrigger.current);
  }

  return (
    <div className="safe-top min-h-dvh bg-surface-rail lg:grid lg:h-dvh lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:grid-rows-[3.5rem_minmax(0,1fr)] lg:overflow-hidden">
      <a href={`#${mainId}`} className="sr-only z-[60] focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded focus:bg-surface-elevated focus:px-4 focus:py-2 focus:text-ink">
        {text.skip}
      </a>

      <header className="sticky top-0 z-30 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-line bg-surface-rail px-3 py-2 sm:h-14 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0 lg:col-span-2">
        <div className="order-1 flex shrink-0 items-center gap-2 lg:w-[14.5rem]">
          <button type="button" ref={toggleNavigation} className="icon-button lg:hidden" aria-label={text.openNavigation} onClick={() => setNavigationOpen(true)}>
            <Bars3Icon className="h-5 w-5" />
          </button>

          <Link href={homeHref} prefetch={false} className="flex shrink-0 items-center gap-2.5 rounded-md text-ink">
            <BrandIcon />
            <span className="text-[15px] font-bold tracking-[-0.02em] sm:text-base">{text.app}</span>
          </Link>
        </div>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 sm:order-3 sm:ml-0">
          <button
            ref={shortcutTrigger}
            type="button"
            onClick={openShortcuts}
            className="icon-button hidden sm:inline-flex"
            aria-label={vi ? 'Phím tắt & Macro' : 'Keyboard shortcuts'}
            title={vi ? 'Phím tắt (?)' : 'Shortcuts (?)'}
          >
            <QuestionMarkCircleIcon className="h-[18px] w-[18px]" />
          </button>
          {onToggleRightSidebar && (
            <button
              type="button"
              data-testid="inspector-toggle"
              onClick={onToggleRightSidebar}
              aria-pressed={rightSidebarOpen}
              aria-label={text.toggleInspector}
              title={`${text.toggleInspector} (I)`}
              className={`icon-button ${rightSidebarOpen ? 'bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M15 4v16" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="icon-button"
            aria-label={theme === 'dark' ? (vi ? 'Chuyển giao diện sáng' : 'Switch to light mode') : (vi ? 'Chuyển giao diện tối' : 'Switch to dark mode')}
            title={theme === 'dark' ? (vi ? 'Giao diện sáng' : 'Light mode') : (vi ? 'Giao diện tối' : 'Dark mode')}
          >
            {theme === 'dark' ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
          </button>

          <button
            ref={profileTrigger}
            type="button"
            data-testid="profile-menu-trigger"
            onClick={toggleProfileMenu}
            aria-expanded={Boolean(profileMenuPos)}
            aria-haspopup="dialog"
            aria-label={`${initials} ${displayName} — ${text.account}`}
            title={displayName}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface-canvas p-1 text-ink shadow-sm transition-colors hover:border-line-strong hover:bg-surface-hover sm:pr-2.5"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-500 text-xs font-bold text-white">
              {initials}
            </span>{' '}
            <span className="hidden max-w-[110px] truncate text-[12.5px] font-semibold sm:inline">{displayName}</span>
            <ChevronDownIcon aria-hidden="true" className="hidden h-3.5 w-3.5 text-ink-muted sm:inline" />
          </button>
        </div>

        <div className="order-3 flex w-full min-w-0 items-center sm:order-2 sm:w-auto sm:flex-1">
          {drive ? (
            <DriveSearch key={drive.folder} search={drive.search} onSearch={drive.onSearch} onOpenPalette={openPalette} />
          ) : (
            <button
              type="button"
              onClick={openPalette}
              className="flex h-10 w-full max-w-[620px] items-center gap-2 rounded-full border border-line bg-surface-canvas pl-3.5 pr-2 text-left text-[13.5px] text-ink-muted shadow-sm transition hover:border-line-strong sm:h-9"
            >
              <MagnifyingGlassIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{vi ? 'Tìm trong Drive hoặc chạy lệnh…' : 'Search Drive or run a command…'}</span>
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-surface-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-secondary sm:inline-flex">
                <span>{vi ? 'Lệnh' : 'Cmd'}</span>
                <kbd className="font-mono text-[10.5px] font-medium">Ctrl+K</kbd>
              </span>
            </button>
          )}
        </div>
      </header>

      <aside className={`ux-scroll-contain min-h-0 min-w-0 border-b border-line bg-surface-rail px-3 py-3 lg:flex lg:h-full lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r lg:py-3.5 ${showDriveActions ? 'block' : 'hidden lg:flex'}`}>
        {drive?.onCreateFolder && (
          <div className="shrink-0 lg:mb-4">
            <button
              ref={newTrigger}
              type="button"
              data-testid="drive-new"
              aria-expanded={Boolean(newMenuPos)}
              aria-haspopup="menu"
              onClick={toggleNewMenu}
              className="flex h-[42px] w-full items-center justify-between rounded-[10px] bg-accent px-3.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition hover:bg-accent-hover active:scale-[0.99]"
            >
              <span className="flex items-center gap-2">
                <PlusIcon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                <span>{text.newItem}</span>
              </span>
              <ChevronDownIcon aria-hidden="true" className="h-4 w-4 opacity-85" />
            </button>
          </div>
        )}
        {drive?.onUpload && !drive.onCreateFolder && (
          <button
            type="button"
            data-testid="upload-open"
            className="button button-primary min-h-10 w-full shrink-0 lg:mb-4"
            onClick={(event) => drive.onUpload?.(event.currentTarget)}
          >
            <ArrowUpTrayIcon aria-hidden="true" className="h-5 w-5" />
            {text.upload}
          </button>
        )}
        <div className="hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <nav aria-label={text.navigation} className="flex-1">
            <NavigationLinks active={section} homeHref={homeHref} admin={user.role === 'admin'} />
          </nav>
          <div className="mt-auto shrink-0 pt-4">
            <StorageQuotaWidget userId={user.id} />
          </div>
        </div>
      </aside>

      <Overlay
        open={navigationOpen}
        title={text.navigation}
        description={text.app}
        onDismiss={() => setNavigationOpen(false)}
        restoreFallback={() => toggleNavigation.current?.focus()}
      >
        <div className="ux-scroll-contain flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <nav aria-label={text.navigation} className="flex-1">
            <NavigationLinks active={section} homeHref={homeHref} admin={user.role === 'admin'} mobile onNavigate={() => setNavigationOpen(false)} />
          </nav>
          <div className="mt-auto pt-4">
            <StorageQuotaWidget userId={user.id} />
          </div>
        </div>
      </Overlay>

      <div className="flex min-h-0 min-w-0 bg-surface-canvas lg:overflow-hidden">
        <main id={mainId} tabIndex={-1} className="safe-bottom ux-scroll-contain min-w-0 flex-1 bg-surface-canvas lg:overflow-y-auto">
          {signOutError && (
            <p role="alert" className="m-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger dark:border-red-900">
              {signOutError}
            </p>
          )}
          {children}
        </main>
        {rightSidebar}
      </div>

      {newMenuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={newMenuRef}
          role="menu"
          style={{ left: newMenuPos.left, top: newMenuPos.top, width: 264 }}
          className="ux-popover-enter fixed z-[85] rounded-[10px] border border-line bg-surface-elevated p-1.5 shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="folder-create-open"
            className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-hover"
            onClick={() => startDriveAction('onCreateFolder')}
          >
            <FolderPlusIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
            <span className="flex-1">{text.createFolder}</span>
            <span aria-hidden="true" className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-muted">Shift+N</span>
          </button>
          {drive?.onUpload && (
            <button
              type="button"
              role="menuitem"
              data-testid="upload-open"
              className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-hover"
              onClick={() => startDriveAction('onUpload')}
            >
              <ArrowUpTrayIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <span className="flex-1">{text.upload}</span>
              <span aria-hidden="true" className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-muted">U</span>
            </button>
          )}
        </div>,
        document.body,
      )}

      {profileMenuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={profileMenuRef}
          role="dialog"
          aria-label={text.account}
          style={{ right: profileMenuPos.right, top: profileMenuPos.top, width: 268 }}
          className="ux-popover-enter fixed z-[85] rounded-[10px] border border-line bg-surface-elevated p-2.5 shadow-2xl"
        >
          <div className="mb-1.5 border-b border-line px-1.5 pb-2.5 pt-0.5">
            <p className="truncate text-[13.5px] font-semibold text-ink">
              {displayName}{user.role === 'admin' ? ' (Admin)' : ''}
            </p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>

          <div className="flex items-center justify-between px-1.5 py-1.5 text-[12.5px] text-ink-secondary">
            <span>{text.language}</span>
            <div role="group" aria-label={text.language} className="inline-flex rounded-md border border-line bg-surface-subtle p-0.5">
              {(['vi', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLocale(lang)}
                  className={`rounded px-2.5 py-0.5 text-[11.5px] font-semibold uppercase transition ${
                    locale === lang ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-1.5 py-1.5 text-[12.5px] text-ink-secondary">
            <span>{vi ? 'Giao diện' : 'Theme'}</span>
            <div role="group" aria-label={vi ? 'Giao diện' : 'Theme'} className="inline-flex rounded-md border border-line bg-surface-subtle p-0.5">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`rounded px-2.5 py-0.5 text-[11.5px] font-semibold transition ${
                  theme === 'light' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {vi ? 'Sáng' : 'Light'}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`rounded px-2.5 py-0.5 text-[11.5px] font-semibold transition ${
                  theme === 'dark' ? 'bg-surface-canvas text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {vi ? 'Tối' : 'Dark'}
              </button>
            </div>
          </div>

          <div className="my-1.5 h-px bg-line" />

          <div className="space-y-0.5">
            <Link
              href="/account"
              prefetch={false}
              onClick={() => setProfileMenuPos(null)}
              className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-ink hover:bg-surface-hover"
            >
              <UserCircleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <span>{text.accountStorage}</span>
            </Link>
            <button
              type="button"
              onClick={() => { setProfileMenuPos(null); openShortcuts(); }}
              className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-hover"
            >
              <QuestionMarkCircleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <span className="flex-1">{vi ? 'Bảng phím tắt' : 'Keyboard shortcuts'}</span>
              <span className="mt-0.5 font-mono text-[11px] text-ink-muted">?</span>
            </button>
          </div>

          <div className="my-1.5 h-px bg-line" />

          <button
            type="button"
            data-testid="logout"
            disabled={signingOut}
            onClick={() => {
              setProfileMenuPos(null);
              setSignOutConfirmOpen(true);
            }}
            className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-[13px] font-medium text-danger hover:bg-danger-soft"
          >
            <ArrowLeftOnRectangleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{signingOut ? text.signOutPending : text.signOut}</span>
          </button>
        </div>,
        document.body,
      )}

      {signOutConfirmOpen && (
        <Overlay
          open={signOutConfirmOpen}
          testId="logout-confirm-dialog"
          title={text.signOutConfirmTitle}
          description={text.signOutConfirmDescription}
          initialFocus={signOutCancelRef}
          restoreFallback={() => profileTrigger.current?.focus()}
          onDismiss={signingOut ? undefined : () => setSignOutConfirmOpen(false)}
        >
          {signOutError && (
            <div className="px-5 pt-4 sm:px-6">
              <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-sm text-danger dark:border-red-900">
                {signOutError}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
            <button
              ref={signOutCancelRef}
              type="button"
              data-testid="logout-cancel"
              className="button button-secondary min-h-10"
              disabled={signingOut}
              onClick={() => setSignOutConfirmOpen(false)}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              data-testid="logout-confirm"
              className="button button-danger min-h-10"
              disabled={signingOut}
              onClick={onSignOut}
            >
              {signingOut ? text.signOutPending : text.signOut}
            </button>
          </div>
        </Overlay>
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
        onToggleInspector={onToggleRightSidebar}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        onDismiss={() => setShortcutsOpen(false)}
        restoreFocus={shortcutsTrigger}
      />
    </div>
  );
}
