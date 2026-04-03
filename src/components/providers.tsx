'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Link from 'next/link';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dictionaries, type Locale } from '@/lib/messages';

export type ThemeMode = 'light' | 'dark';

type ToastOptions = {
  message: string;
  href?: string;
  hrefLabel?: string;
  tone?: 'success' | 'info' | 'error';
};

type ToastItem = ToastOptions & { id: number };

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);
const ThemeContext = createContext<{ theme: ThemeMode; setTheme: (theme: ThemeMode) => void; toggleTheme: () => void } | null>(null);
const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

const THEME_STORAGE_KEY = 'cloud_drive_theme';
const THEME_EVENT = 'cloud-drive-theme-change';

function subscribeTheme(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('Locale provider is missing');
  const { locale, setLocale } = value;
  return { locale, setLocale, text: dictionaries[locale] };
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('Theme provider is missing');
  return value;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('Toast provider is missing');
  return value;
}

export function Providers({ children, initialLocale }: { children: ReactNode; initialLocale: Locale }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000, gcTime: 60_000 } },
  }));
  const [locale, updateLocale] = useState(initialLocale);
  const [offline, setOffline] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastId = useRef(0);
  const toastTimers = useRef<Map<number, number>>(new Map());
  const theme = useSyncExternalStore<ThemeMode>(subscribeTheme, readStoredTheme, () => 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (!navigator.onLine) window.dispatchEvent(new Event('offline'));
    const timers = toastTimers.current;
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  function setLocale(next: Locale) {
    document.documentElement.lang = next;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `cloud_drive_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    updateLocale(next);
  }

  const setTheme = useCallback((next: ThemeMode) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage quota errors in private browsing.
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readStoredTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  const dismissToast = useCallback((id: number) => {
    const timerId = toastTimers.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      toastTimers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((options: ToastOptions) => {
    const id = ++nextToastId.current;
    setToasts((current) => [...current.slice(-2), { ...options, id }]);
    const timerId = window.setTimeout(() => dismissToast(id), 5000);
    toastTimers.current.set(id, timerId);
  }, [dismissToast]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
        <LocaleContext.Provider value={{ locale, setLocale }}>
          <ToastContext.Provider value={pushToast}>
            {offline && (
              <p role="status" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                {dictionaries[locale].offline}
              </p>
            )}
            {children}
            {toasts.length > 0 && (
              <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[85] flex max-w-sm flex-col gap-2">
                {toasts.map((item) => (
                  <div
                    key={item.id}
                    className={`ux-popover-enter pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg ${
                      item.tone === 'error'
                        ? 'border-red-300 bg-red-950 text-red-50'
                        : 'border-slate-700 bg-slate-900 text-slate-50'
                    }`}
                  >
                    <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.message}</p>
                    {item.href && item.hrefLabel && (
                      <Link
                        href={item.href}
                        prefetch={false}
                        onClick={() => dismissToast(item.id)}
                        className="shrink-0 whitespace-nowrap font-semibold text-primary-300 underline hover:text-primary-200"
                      >
                        {item.hrefLabel}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => dismissToast(item.id)}
                      aria-label={dictionaries[locale].close}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ToastContext.Provider>
        </LocaleContext.Provider>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}
