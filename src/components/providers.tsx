'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { dictionaries, type Locale } from '@/lib/messages';

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('Locale provider is missing');
  const { locale, setLocale } = value;
  return { locale, setLocale, text: dictionaries[locale] };
}

export function Providers({ children, initialLocale }: { children: ReactNode; initialLocale: Locale }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000, gcTime: 60_000 } },
  }));
  const [locale, updateLocale] = useState(initialLocale);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (!navigator.onLine) window.dispatchEvent(new Event('offline'));
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  function setLocale(next: Locale) {
    document.documentElement.lang = next;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `cloud_drive_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    updateLocale(next);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleContext.Provider value={{ locale, setLocale }}>
        {offline && <p role="status" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">{dictionaries[locale].offline}</p>}
        {children}
      </LocaleContext.Provider>
    </QueryClientProvider>
  );
}
