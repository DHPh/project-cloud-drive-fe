'use client';

import { useLocale } from './providers';

export function LanguageSwitch() {
  const { locale, setLocale, text } = useLocale();
  return (
    <select
      aria-label={text.language}
      className="h-9 rounded-lg border border-slate-200 bg-white px-1.5 text-base text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:px-2 sm:text-sm"
      value={locale}
      onChange={(event) => setLocale(event.currentTarget.value === 'en' ? 'en' : 'vi')}
    >
      <option value="vi" lang="vi">VI</option>
      <option value="en" lang="en">EN</option>
    </select>
  );
}
