'use client';

import { ArrowLeftOnRectangleIcon, ArrowUpTrayIcon, Bars3Icon, FolderIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { User } from '@/lib/api';
import { BrandIcon } from '../brand';
import { LanguageSwitch } from '../language-switch';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type SearchProps = { search: string; onSearch: (search: string) => void };

function DriveSearch({ search, onSearch }: SearchProps) {
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
    <form className="relative w-full max-w-2xl" role="search" onSubmit={(event) => { event.preventDefault(); schedule(input.current?.value ?? '', true); }}>
      <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-600" />
      <input
        ref={input} data-testid="drive-search" type="search" name="q" autoComplete="off" maxLength={255} defaultValue={search}
        className="h-10 w-full rounded-full border border-transparent bg-gray-100 pl-10 pr-3 text-base text-gray-900 placeholder:text-gray-600 focus:border-primary-500 focus:bg-white sm:h-11 sm:text-sm"
        placeholder={text.searchPlaceholder} aria-label={text.search}
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

type Props = SearchProps & {
  user: User;
  folder: string;
  homeHref: string;
  signingOut: boolean;
  signOutError: string | null;
  onUpload: (trigger: HTMLElement | null) => void;
  onSignOut: () => void;
  children: ReactNode;
};

export function DriveLayout({ user, folder, homeHref, search, onSearch, onUpload, signingOut, signOutError, onSignOut, children }: Props) {
  const { text } = useLocale();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const toggleNavigation = useRef<HTMLButtonElement>(null);
  const newMenu = useRef<HTMLDetailsElement>(null);
  const newTrigger = useRef<HTMLElement>(null);

  const initials = (user.name.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('') || user.email[0] || '?').toUpperCase();

  function startUpload() {
    if (newMenu.current) newMenu.current.open = false;
    onUpload(newTrigger.current);
  }

  return (
    <div className="safe-top min-h-dvh bg-gray-50 lg:grid lg:min-h-dvh lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-[4rem_1fr]">
      <a href="#drive-main" className="sr-only z-[60] focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-4 focus:py-2">{text.skip}</a>
      <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center gap-2 border-b border-gray-200 bg-white px-2.5 sm:gap-4 sm:px-4 lg:col-span-2">
        <button type="button" ref={toggleNavigation} className="icon-button lg:hidden" aria-label={text.openNavigation} onClick={() => setNavigationOpen(true)}><Bars3Icon className="h-6 w-6" /></button>
        <Link href={homeHref} prefetch={false} className="hidden shrink-0 items-center gap-2 rounded-md text-gray-800 sm:flex lg:w-[14rem]">
          <BrandIcon /><span className="text-xl font-medium">{text.app}</span>
        </Link>
        <div className="min-w-0 flex-1"><DriveSearch key={folder} search={search} onSearch={onSearch} /></div>
        <LanguageSwitch />
        <span title={user.name || user.email} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800 sm:h-9 sm:w-9"><span className="sr-only">{text.account}: {user.name || user.email}</span><span aria-hidden="true">{initials}</span></span>
        <button type="button" data-testid="logout" disabled={signingOut} onClick={onSignOut} className="icon-button shrink-0" aria-label={signingOut ? text.signOutPending : text.signOut} title={text.signOut}>
          <ArrowLeftOnRectangleIcon className="h-5 w-5" />
        </button>
      </header>
      <aside className="min-w-0 bg-white px-4 pt-3 lg:bg-transparent lg:px-3 lg:pt-4">
        <details ref={newMenu} className="group relative inline-block min-w-32 lg:mb-5 lg:block" onKeyDown={(event) => {
          if (event.key === 'Escape' && newMenu.current?.open) { newMenu.current.open = false; newTrigger.current?.focus(); }
        }}>
          <summary ref={newTrigger} data-testid="drive-new" className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-2.5 font-medium text-gray-800 shadow-md transition-colors hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
            <PlusIcon aria-hidden="true" className="h-6 w-6" />{text.newItem}
          </summary>
          <div className="panel absolute left-0 z-30 mt-2 min-w-[11rem] p-1.5 lg:right-0">
            <button type="button" data-testid="upload-open" className="button w-full justify-start text-gray-700 hover:bg-gray-100" onClick={startUpload}><ArrowUpTrayIcon className="h-5 w-5" />{text.upload}</button>
          </div>
        </details>
        <nav aria-label={text.navigation} className="hidden lg:block">
          <Link href={homeHref} prefetch={false} aria-current="page" className="flex items-center gap-3 rounded-full bg-primary-100 px-4 py-2.5 text-sm font-medium text-primary-800"><FolderIcon aria-hidden="true" className="h-5 w-5" />{text.myDrive}</Link>
        </nav>
      </aside>
      <Overlay
        open={navigationOpen} title={text.navigation} description={text.app}
        onDismiss={() => setNavigationOpen(false)} restoreFallback={() => toggleNavigation.current?.focus()}
      >
        <nav aria-label={text.navigation} className="p-4">
          <Link href={homeHref} prefetch={false} onClick={() => setNavigationOpen(false)} className="flex items-center gap-3 rounded-full bg-primary-100 px-4 py-2.5 text-sm font-medium text-primary-800"><FolderIcon aria-hidden="true" className="h-5 w-5" />{text.myDrive}</Link>
        </nav>
      </Overlay>
      <main id="drive-main" tabIndex={-1} className="safe-bottom min-w-0 bg-white lg:m-0 lg:min-h-[calc(100dvh-4rem)] lg:rounded-tl-2xl lg:border-l lg:border-t lg:border-gray-200">
        {signOutError && <p role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{signOutError}</p>}
        {children}
      </main>
    </div>
  );
}
