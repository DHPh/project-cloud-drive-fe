export function readableSize(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`;
  const tiers = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let tier = 0;
  while (value >= 1024 && tier < tiers.length - 1) { value /= 1024; tier++; }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${tiers[tier]}`;
}
