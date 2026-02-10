'use client';

import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { login, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { publishSessionChange } from '@/lib/session-events';
import { BrandIcon } from './brand';
import { LanguageSwitch } from './language-switch';
import { useLocale } from './providers';

export function LoginForm({ onSuccess, email, className = '' }: { onSuccess: (user: User) => Promise<void>; email?: string; className?: string }) {
  const { text } = useLocale();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const prefix = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
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
    <form onSubmit={submit} className={`space-y-5 ${className}`}>
      <div>
        <label htmlFor={`${prefix}-email`} className="mb-1.5 block text-sm font-medium text-gray-700">{text.email}</label>
        <input
          id={`${prefix}-email`} name="email" data-testid="login-email" type="email" className="field"
          autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={email} required
        />
      </div>
      <div>
        <label htmlFor={`${prefix}-password`} className="mb-1.5 block text-sm font-medium text-gray-700">{text.password}</label>
        <div className="relative">
          <input id={`${prefix}-password`} name="password" data-testid="login-password" type={showPassword ? 'text' : 'password'} className="field pr-12" autoComplete="current-password" required />
          <button type="button" className="icon-button absolute right-0.5 top-0.5" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? text.hidePassword : text.showPassword}>
            {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <button type="submit" data-testid="login-submit" className="button button-primary w-full" disabled={pending}>
        {pending ? text.signingIn : text.signIn}
      </button>
    </form>
  );
}

export function LoginScreen({ destination }: { destination: string }) {
  const { text } = useLocale();
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
    <main className="safe-top safe-bottom relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 px-4 py-20 sm:px-6">
      <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]"><LanguageSwitch /></div>
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <BrandIcon large />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{text.app}</h1>
          <p className="mt-1 text-lg font-medium text-gray-700">{text.signInTitle}</p>
        </div>
        <LoginForm onSuccess={onSignIn} className="rounded-2xl bg-white p-6 shadow-xl sm:p-8" />
      </div>
    </main>
  );
}
