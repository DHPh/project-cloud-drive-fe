'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getAccount } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { useLocale } from './providers';

export function StorageQuotaWidget({ userId }: { userId: string }) {
  const { locale, text } = useLocale();
  const query = useQuery({
    queryKey: ['account', userId],
    queryFn: ({ signal }) => getAccount(signal),
    staleTime: 60_000,
  });

  const storage = query.data?.storage;
  if (!storage) return null;

  const quota = Math.max(1, storage.quotaBytes);
  const totalPct = Math.min(100, Math.round((storage.usedBytes / quota) * 100));
  const trashedBytes = Math.min(storage.trashedBytes, storage.usedBytes);
  const activeBytes = Math.max(0, storage.usedBytes - trashedBytes);
  const activePct = Math.min(100, (activeBytes / quota) * 100);
  const trashPct = Math.min(100 - activePct, (trashedBytes / quota) * 100);

  return (
    <section
      aria-label={text.accountStorage}
      className="mt-4 rounded-[10px] border border-line bg-surface-canvas p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-ink">{text.storageUsed}</span>
        <span className="tabular-nums text-accent-text">{totalPct}%</span>
      </div>
      <div className="mb-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div className="h-full bg-accent transition-all" style={{ width: `${activePct.toFixed(1)}%` }} />
        {trashedBytes > 0 && (
          <div className="h-full bg-warning transition-all" style={{ width: `${trashPct.toFixed(1)}%` }} />
        )}
      </div>
      <p className="text-[11.5px] tabular-nums text-ink-muted">
        {readableSize(storage.usedBytes, locale)} / {readableSize(storage.quotaBytes, locale)}
      </p>
      {trashedBytes > 0 ? (
        <Link
          href="/trash"
          prefetch={false}
          className="mt-1.5 inline-block text-[11.5px] font-semibold text-accent-text hover:underline"
        >
          {text.trash}: {readableSize(trashedBytes, locale)} →
        </Link>
      ) : (
        <Link
          href="/account"
          prefetch={false}
          className="mt-1.5 inline-block text-[11.5px] font-semibold text-accent-text hover:underline"
        >
          {text.accountStorage} →
        </Link>
      )}
    </section>
  );
}
