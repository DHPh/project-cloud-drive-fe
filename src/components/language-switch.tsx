'use client';

import { useLocale } from './providers';

export function LanguageSwitch() {
  const { locale, setLocale, text } = useLocale();
  return (
    <select
      aria-label={text.language}
      className="h-9 rounded-lg border border-line bg-surface-canvas px-2 text-base text-ink hover:border-line-strong sm:text-sm"
      value={locale}
      onChange={(event) => setLocale(event.currentTarget.value === 'en' ? 'en' : 'vi')}
    >
      <option value="vi" lang="vi">VI</option>
      <option value="en" lang="en">EN</option>
    </select>
  );
}
