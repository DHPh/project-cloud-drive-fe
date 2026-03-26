'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

type Props = { href: string; url: string; title: string; trigger: HTMLElement; onDismiss: () => void; restoreFallback: () => void };

export function ShareQrDialog({ href, url, title, trigger, onDismiss, restoreFallback }: Props) {
  const { text } = useLocale();
  const [result, setResult] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;
    void import('qrcode').then(({ default: qr }) => qr.toDataURL(url, { width: 256, margin: 3 })).then((image) => {
      if (!ignore) setResult(image);
    }).catch(() => {
      if (!ignore) setResult('');
    });
    return () => { ignore = true; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(text.shareCopied);
    } catch {
      input.current?.focus();
      input.current?.select();
      setNotice(text.shareCopyFallback);
    }
  }

  return (
    <Overlay testId="share-qr-dialog" title={text.shareQr} description={text.shareQrDescription} onDismiss={onDismiss} initialFocus={input} restoreFocus={trigger} restoreFallback={restoreFallback}>
      <div className="min-h-0 space-y-3 overflow-y-auto p-5 sm:p-6">
        <p className="text-sm font-semibold [overflow-wrap:anywhere]">{title}</p>
        {result === null && <p role="status" className="text-sm text-gray-600">{text.loading}</p>}
        {result === '' && <p role="alert" className="text-sm text-red-800">{text.shareQrFailed}</p>}
        {result && <Image alt={text.shareQr} unoptimized width={256} height={256} src={result} data-testid="share-qr-image" className="mx-auto h-auto max-w-full rounded-lg border border-gray-100" />}
        <label htmlFor="share-qr-url" className="block text-sm font-medium">{text.shareLink}</label>
        <input ref={input} id="share-qr-url" data-testid="share-qr-url" className="field" value={url} readOnly />
        <p role="status" className={notice ? 'text-sm text-gray-700' : 'sr-only'}>{notice}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="share-qr-copy" className="button button-secondary min-h-11" onClick={() => void copy()}>{text.shareCopy}</button>
          <Link data-testid="share-qr-open" href={href} prefetch={false} className="button button-secondary min-h-11">{text.openSharedItem}</Link>
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-3 sm:px-6">
        <button type="button" data-testid="share-qr-close" className="button button-secondary min-h-11" onClick={onDismiss}>{text.close}</button>
      </div>
    </Overlay>
  );
}
