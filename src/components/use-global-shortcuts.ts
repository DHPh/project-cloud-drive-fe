'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

type Options = {
  isAdmin: boolean;
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
};

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useGlobalShortcuts({ isAdmin, onOpenPalette, onOpenShortcuts }: Options) {
  const router = useRouter();
  const chord = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const mod = event.ctrlKey || event.metaKey;
      const lower = event.key.toLowerCase();

      if (mod && lower === 'k') {
        event.preventDefault();
        onOpenPalette();
        return;
      }

      if (isEditableElement(event.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      const now = Date.now();
      if (chord.current?.key === 'g' && now - chord.current.at < 800) {
        chord.current = null;
        const routes: Record<string, string> = {
          d: '/drive',
          t: '/drive/timeline',
          s: '/shared-with-me',
          o: '/shared-by-me',
          b: '/boards',
          x: '/trash',
          ...(isAdmin ? { a: '/admin' } : {}),
        };
        const destination = routes[lower];
        if (destination) {
          event.preventDefault();
          router.push(destination);
          return;
        }
      }

      if (lower === 'g' && !mod && !event.shiftKey && !event.altKey) {
        chord.current = { key: 'g', at: now };
        return;
      }

      if (event.key === '?' && !mod) {
        event.preventDefault();
        onOpenShortcuts();
        return;
      }

      if (event.key === '/' && !mod && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        onOpenPalette();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isAdmin, onOpenPalette, onOpenShortcuts, router]);
}
