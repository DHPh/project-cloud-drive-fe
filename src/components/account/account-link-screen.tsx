'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { acceptAccountInvite, ApiError, resetAccountPassword } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { BrandIcon } from '../brand';
import { LanguageSwitch } from '../language-switch';
import { useLocale } from '../providers';
import { NewPasswordFields, readNewPassword } from './new-password-fields';

export function AccountLinkScreen({ kind }: { kind: 'invite' | 'reset' }) {
  const { text } = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    // Browsers can follow another link to this path without remounting the page.
    function captureFragment() {
      request.current?.abort();
      request.current = null;
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname);
      setPending(false);
      setError('');
      setClosed(false);
      setCompleted(false);
      setFormVersion((current) => current + 1);
      setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : '');
    }
    const timer = window.setTimeout(captureFragment, 0);
    function onHashChange() {
      window.clearTimeout(timer);
      captureFragment();
    }
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('hashchange', onHashChange);
      request.current?.abort();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || request.current || closed) return;
    const data = new FormData(event.currentTarget);
    const validated = readNewPassword(data);
    if ('error' in validated) { setError(validated.error === 'mismatch' ? text.passwordMismatch : text.passwordRequirements); return; }
    const name = String(data.get('name') ?? '').trim();
    if (kind === 'invite' && (!name || [...name].length > 120)) { setError(text.invalidRequest); return; }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      if (kind === 'invite') await acceptAccountInvite({ token, name, password: validated.password }, controller.signal);
      else await resetAccountPassword({ token, password: validated.password }, controller.signal);
      if (!controller.signal.aborted) { setCompleted(true); setToken(''); }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(localizedError(failure, text));
        if (failure instanceof ApiError && [404, 409, 410].includes(failure.status)) { setClosed(true); setToken(''); }
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }

  const title = kind === 'invite' ? text.inviteAccount : text.resetAccountPassword;
  return (
    <main className="safe-top safe-bottom relative flex min-h-dvh items-center justify-center bg-surface-rail px-4 py-20 text-ink sm:px-6">
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]"><LanguageSwitch /></div>
      <div className="w-full max-w-md space-y-5">
        <div className="space-y-3 text-center"><BrandIcon large /><h1 className="text-xl font-bold text-ink">{title}</h1></div>
        <div className="panel space-y-4 p-5 sm:p-7">
          {completed ? <p role="status" data-testid="account-link-complete" className="text-sm text-success">{kind === 'invite' ? text.inviteCompleted : text.resetCompleted}</p>
            : closed ? <p data-testid="account-link-error" role="alert" className="text-sm text-danger">{error}</p>
              : token === null ? <p role="status" className="text-sm text-ink-secondary">{text.loading}</p>
              : token ? (
                <form key={formVersion} method="post" onSubmit={(event) => void submit(event)} className="space-y-3">
                  {kind === 'invite' && <label className="block space-y-1 text-sm font-medium">{text.accountName}
                    <input data-testid="invite-name" name="name" className="field" autoComplete="name" disabled={pending || closed} maxLength={240} required />
                  </label>}
                  <NewPasswordFields disabled={pending || closed} />
                  {error && <p data-testid="account-link-error" role="alert" className="text-sm text-danger">{error}</p>}
                  <button data-testid="account-link-submit" type="submit" className="button button-primary min-h-11" disabled={pending || closed}>{pending ? text.saving : title}</button>
                </form>
              ) : <p data-testid="account-link-error" role="alert" className="text-sm text-danger">{text.accountLinkInvalid}</p>}
          <Link href="/login" prefetch={false} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-accent-text hover:underline">{text.signIn}</Link>
        </div>
      </div>
    </main>
  );
}
