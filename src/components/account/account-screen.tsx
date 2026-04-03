'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, changeAccountPassword, getAccount, updateAccount, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { publishSessionChange } from '@/lib/session-events';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { useLocale } from '../providers';
import { NewPasswordFields, readNewPassword } from './new-password-fields';

export function AccountScreen({ initialUser }: { initialUser: User }) {
  const { user, expired, expire, signingOut, signOutError, signOut, sessionDialog } = useAccountSession(initialUser, '/account');
  const { text, locale } = useLocale();
  const queryClient = useQueryClient();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<'profile' | 'password' | null>(null);
  const request = useRef<AbortController | null>(null);
  const queryKey = ['account', user.id] as const;
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getAccount(signal), enabled: !expired, refetchOnMount: 'always' });
  const profile = !query.error && !expired ? query.data : undefined;
  const name = nameDraft ?? profile?.user.name ?? '';

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (query.error instanceof ApiError && query.error.status === 401) expire(); }, [query.error, expire]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = name.trim();
    if (!profile || request.current || next === profile.user.name) return;
    if (!next || [...next].length > 120) { setProfileError(text.invalidRequest); return; }
    const controller = new AbortController();
    request.current = controller;
    setPending('profile');
    setProfileError('');
    setSaved(false);
    try {
      const updated = await updateAccount({ name: next }, controller.signal);
      if (controller.signal.aborted) return;
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, updated);
      setNameDraft(null);
      setSaved(true);
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) expire();
        else setProfileError(localizedError(failure, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || request.current) return;
    const data = new FormData(event.currentTarget);
    const validated = readNewPassword(data);
    if ('error' in validated) { setPasswordError(validated.error === 'mismatch' ? text.passwordMismatch : text.passwordRequirements); return; }
    const controller = new AbortController();
    request.current = controller;
    setPending('password');
    setPasswordError('');
    try {
      await changeAccountPassword({ currentPassword: String(data.get('currentPassword') ?? ''), password: validated.password }, controller.signal);
      if (controller.signal.aborted) return;
      await queryClient.cancelQueries();
      queryClient.clear();
      publishSessionChange();
      window.location.replace('/login');
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) expire();
        else setPasswordError(localizedError(failure, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  return (
    <>
      <DriveLayout user={profile?.user ?? user} section="account" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <h1 className="text-lg font-semibold">{text.account}</h1>
          {query.isPending && !expired && <p role="status" className="panel p-4 text-sm text-slate-600 dark:text-slate-400">{text.loading}</p>}
          {query.error && !expired && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              <p>{localizedError(query.error, text)}</p>
              <button type="button" className="button button-secondary min-h-11" onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {profile && (() => {
            const quota = Math.max(1, profile.storage.quotaBytes);
            const totalPct = Math.min(100, Math.round((profile.storage.usedBytes / quota) * 100));
            const trashed = Math.min(profile.storage.trashedBytes, profile.storage.usedBytes);
            const active = Math.max(0, profile.storage.usedBytes - trashed);
            const activePct = Math.min(100, (active / quota) * 100);
            const trashPct = Math.min(100 - activePct, (trashed / quota) * 100);
            return (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="panel space-y-3 p-4 sm:p-5">
                  <h2 className="font-semibold">{text.accountProfile}</h2>
                  <p className="text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{profile.user.email}</p>
                  <form method="post" onSubmit={(event) => void saveProfile(event)} className="space-y-3">
                    <label className="block space-y-1 text-sm font-medium">{text.accountName}
                      <input data-testid="account-name" className="field" name="name" value={name} maxLength={240} required readOnly={Boolean(pending)} onChange={(event) => { setNameDraft(event.currentTarget.value); setSaved(false); setProfileError(''); }} />
                    </label>
                    {profileError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{profileError}</p>}
                    <button type="submit" data-testid="account-name-save" disabled={Boolean(pending) || name.trim() === profile.user.name} className="button button-primary min-h-11">{pending === 'profile' ? text.saving : text.save}</button>
                    <p role="status" data-testid="account-profile-status" className={saved ? 'text-sm text-emerald-700 dark:text-emerald-300' : 'sr-only'}>{saved ? text.accountSaved : ''}</p>
                  </form>
                </section>
                <section className="panel space-y-3 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold">{text.accountStorage}</h2>
                    <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary-800 dark:bg-primary-950/60 dark:text-primary-200">{totalPct}%</span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full bg-primary-600" style={{ width: `${activePct.toFixed(1)}%` }} />
                    {trashed > 0 && <div className="h-full bg-amber-500" style={{ width: `${trashPct.toFixed(1)}%` }} />}
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2"><dt>{text.storageUsed}</dt><dd data-testid="account-used" className="font-semibold tabular-nums">{readableSize(profile.storage.usedBytes, locale)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>{text.storageQuota}</dt><dd data-testid="account-quota" className="tabular-nums">{readableSize(profile.storage.quotaBytes, locale)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>{text.storageTrashed}</dt><dd data-testid="account-trash" className="tabular-nums">{readableSize(profile.storage.trashedBytes, locale)}</dd></div>
                  </dl>
                </section>
                <section className="panel space-y-3 p-4 sm:p-5">
                  <h2 className="font-semibold">{text.changePassword}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{text.passwordSignInAgain}</p>
                  <form method="post" onSubmit={(event) => void changePassword(event)} className="space-y-3">
                    <label className="block space-y-1 text-sm font-medium">{text.currentPassword}
                      <input data-testid="account-current-password" name="currentPassword" type="password" autoComplete="current-password" className="field" disabled={Boolean(pending)} required maxLength={2048} />
                    </label>
                    <NewPasswordFields disabled={Boolean(pending)} />
                    {passwordError && <p data-testid="account-password-error" role="alert" className="text-sm text-red-700 dark:text-red-400">{passwordError}</p>}
                    <button type="submit" data-testid="account-password-save" className="button button-primary min-h-11" disabled={Boolean(pending)}>{pending === 'password' ? text.saving : text.changePassword}</button>
                  </form>
                </section>
              </div>
            );
          })()}
        </div>
      </DriveLayout>
      {sessionDialog}
    </>
  );
}
