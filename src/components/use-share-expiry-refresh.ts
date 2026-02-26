'use client';

import { useEffect } from 'react';

type ExpiringShare = { expiresAt: string; isActive?: boolean };

export function useShareExpiryRefresh(items: ExpiringShare[] | undefined, refresh: () => Promise<unknown>) {
  useEffect(() => {
    const now = Date.now();
    let nextExpiry = Infinity;
    for (const item of items ?? []) {
      const expires = Date.parse(item.expiresAt);
      if (item.isActive !== false && expires > now) nextExpiry = Math.min(nextExpiry, expires);
    }
    if (nextExpiry === Infinity) return;

    let timer: number;
    function schedule() {
      const delay = nextExpiry - Date.now() + 250;
      if (delay > 0) timer = window.setTimeout(schedule, Math.min(delay, 2_147_483_647));
      else void refresh();
    }
    schedule();
    return () => window.clearTimeout(timer);
  }, [items, refresh]);
}
