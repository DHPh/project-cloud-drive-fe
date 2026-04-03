'use client';

import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState, useSyncExternalStore } from 'react';
import { login, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { publishSessionChange } from '@/lib/session-events';
import { BrandIcon } from './brand';
import { LanguageSwitch } from './language-switch';
import { useLocale } from './providers';

const subscribeHydration = () => () => undefined;

export function LoginForm({ onSuccess, email, className = '' }: { onSuccess: (user: User) => Promise<void>; email?: string; className?: string }) {
  const { text } = useLocale();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const prefix = useId();
  // A server-rendered form must wait for its client submit handler.
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const formDisabled = !hydrated || pending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const address = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const user = await login({ email: address, password });
      await onSuccess(user);
    } catch (failure) {
      setError(localizedError(failure, text));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className={`space-y-5 ${className}`}>
      <div>
        <label htmlFor={`${prefix}-email`} className="mb-1.5 block text-sm font-medium text-gray-700">{text.email}</label>
        <input
          id={`${prefix}-email`} name="email" data-testid="login-email" type="email" className="field"
          autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={email} disabled={formDisabled} required
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-password`} className="mb-1.5 block text-sm font-medium text-gray-700">{text.password}</label>
        <div className="relative">
          <input id={`${prefix}-password`} name="password" data-testid="login-password" type={showPassword ? 'text' : 'password'} className="field pr-12" autoComplete="current-password" disabled={formDisabled} required />
          <button type="button" className="icon-button absolute right-0.5 top-0.5" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? text.hidePassword : text.showPassword} disabled={formDisabled}>
            {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button type="submit" data-testid="login-submit" className="button button-primary w-full" disabled={formDisabled}>
        {pending ? text.signingIn : text.signIn}
      </button>
    </form>
  );
}

export function LoginScreen({ destination }: { destination: string }) {
  const { locale, text } = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();

  async function onSignIn() {
    await queryClient.cancelQueries();
    queryClient.clear();
    publishSessionChange();
    router.replace(destination);
    router.refresh();
  }

  return (
    <main className="safe-top safe-bottom relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary-50 via-slate-50 to-indigo-100 px-4 py-20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:px-6">
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]"><LanguageSwitch /></div>
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <BrandIcon large />
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">{text.app}</h1>
          <p className="mt-1 text-lg font-medium text-slate-700 dark:text-slate-300">{text.signInTitle}</p>
        </div>
        <LoginForm onSuccess={onSignIn} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8" />
        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
          <Link href="/explore" prefetch={false} className="font-medium text-primary-700 hover:underline dark:text-primary-300">
            {locale === 'vi' ? 'Xem các bảng công khai trong Khám phá →' : 'Browse public boards in Explore →'}
          </Link>
        </p>
      </div>
    </main>
  );
}
