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
      className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-slate-700 dark:text-slate-200">{text.storageUsed}</span>
        <span className="tabular-nums text-primary-700 dark:text-primary-300">{totalPct}%</span>
      </div>
      <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full bg-primary-600 transition-all" style={{ width: `${activePct.toFixed(1)}%` }} />
        {trashedBytes > 0 && (
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${trashPct.toFixed(1)}%` }} />
        )}
      </div>
      <p className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
        {readableSize(storage.usedBytes, locale)} / {readableSize(storage.quotaBytes, locale)}
      </p>
      {trashedBytes > 0 ? (
        <Link
          href="/trash"
          prefetch={false}
          className="mt-1.5 inline-block text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
        >
          {text.trash}: {readableSize(trashedBytes, locale)} →
        </Link>
      ) : (
        <Link
          href="/account"
          prefetch={false}
          className="mt-1.5 inline-block text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
        >
          {text.accountStorage} →
        </Link>
      )}
    </section>
  );
}
