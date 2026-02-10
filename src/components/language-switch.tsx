'use client';

import { useLocale } from './providers';

export function LanguageSwitch() {
  const { locale, setLocale, text } = useLocale();
  return (
    <select
      aria-label={text.language}
      className="h-10 rounded-lg border border-gray-200 bg-white px-1.5 text-base sm:px-2.5 sm:text-sm"
      value={locale}
      onChange={(event) => setLocale(event.currentTarget.value === 'en' ? 'en' : 'vi')}
    >
      <option value="vi" lang="vi">VI</option>
      <option value="en" lang="en">EN</option>
    </select>
  );
}
