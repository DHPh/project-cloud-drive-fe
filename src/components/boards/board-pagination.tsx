'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useLocale } from '../providers';

export function BoardPagination({ page, totalPages, path }: { page: number; totalPages: number; path: string }) {
  const { text } = useLocale();
  const lastPage = Math.max(1, totalPages);
  const href = (target: number) => target === 1 ? path : `${path}?page=${target}`;
  if (page === 1 && lastPage === 1) return null;

  return (
    <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
      <p className="text-sm text-ink-secondary">{text.page} {Math.min(page, lastPage)} / {lastPage}</p>
      <div className="flex gap-2">
        {page > 1 && <Link href={href(Math.min(page - 1, lastPage))} prefetch={false} aria-label={text.previousPage} className="icon-button h-11 w-11"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
        {page < lastPage && <Link href={href(page + 1)} prefetch={false} aria-label={text.nextPage} className="icon-button h-11 w-11"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
      </div>
    </nav>
  );
}
