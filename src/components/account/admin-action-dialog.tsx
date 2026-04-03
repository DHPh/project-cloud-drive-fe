'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, createAccountInvite, issueAdminPasswordReset, revokeAccountInvite, updateAdminUser, type AccountInvite, type AdminUser, type AdminUserUpdate } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { shareDateFormat } from '@/lib/share-expiry';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

export type AdminAction =
  | { kind: 'invite'; trigger: HTMLElement }
  | { kind: 'revoke'; invite: AccountInvite; trigger: HTMLElement }
  | { kind: 'user' | 'reset'; account: AdminUser; trigger: HTMLElement };

type Props = {
  action: AdminAction;
  actorId: string;
  suspended: boolean;
  onDismiss: () => void;
  onExpired: () => void;
  onChanged: (message?: string) => Promise<void>;
  onOwnSessionEnded: () => Promise<void>;
  restoreActionFocus: () => void;
};

function issuedUrl(path: '/invite' | '/reset-password', token: string) {
  const url = new URL(path, window.location.origin);
  url.hash = new URLSearchParams({ token }).toString();
  return url.href;
}

export function AdminActionDialog({ action, actorId, suspended, onDismiss, onExpired, onChanged, onOwnSessionEnded, restoreActionFocus }: Props) {
  const { text, locale } = useLocale();
  const [role, setRole] = useState<AdminUser['role']>(action.kind === 'user' ? action.account.role : 'user');
  const [disabled, setDisabled] = useState(action.kind === 'user' && action.account.disabled);
  const [quota, setQuota] = useState(action.kind === 'user' ? String(action.account.quotaBytes) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  const email = useRef<HTMLInputElement>(null);
  const roleField = useRef<HTMLSelectElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const title = { invite: text.createInvite, revoke: text.revokeInvite, user: text.editAdminAccount, reset: text.issueReset }[action.kind];
  const description = { invite: text.inviteIssueDescription, revoke: text.inviteRevokeDescription, user: text.adminLockDescription, reset: text.resetIssueDescription }[action.kind];
  const unchanged = action.kind === 'user' && role === action.account.role && disabled === action.account.disabled && quota === String(action.account.quotaBytes);
  const parsedQuota = /^\d+$/.test(quota) && Number.isSafeInteger(Number(quota)) ? Number(quota) : null;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (issued) linkInput.current?.focus(); }, [issued]);

  function dismiss() { if (!request.current) onDismiss(); }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopyStatus(text.shareCopied);
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setCopyStatus(text.shareCopyFallback);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || issued || unchanged) return;
    const data = new FormData(event.currentTarget);
    const numericQuota = Number(quota);
    if (action.kind === 'user' && (!/^\d+$/.test(quota) || !Number.isSafeInteger(numericQuota))) { setError(text.invalidQuota); return; }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      if (action.kind === 'invite') {
        const created = await createAccountInvite({ email: String(data.get('email') ?? '').trim() }, controller.signal);
        if (controller.signal.aborted) return;
        setIssued({ url: issuedUrl('/invite', created.token), expiresAt: created.invite.expiresAt });
        await onChanged();
      } else if (action.kind === 'reset') {
        const issuedReset = await issueAdminPasswordReset(action.account.id, controller.signal);
        if (controller.signal.aborted) return;
        setIssued({ url: issuedUrl('/reset-password', issuedReset.token), expiresAt: issuedReset.expiresAt });
        await onChanged();
      } else if (action.kind === 'revoke') {
        await revokeAccountInvite(action.invite.id, controller.signal);
        if (controller.signal.aborted) return;
        await onChanged(text.adminInviteRevoked);
        onDismiss();
      } else {
        const changes: AdminUserUpdate = {
          ...(role !== action.account.role ? { role } : {}),
          ...(disabled !== action.account.disabled ? { disabled } : {}),
          ...(numericQuota !== action.account.quotaBytes ? { quotaBytes: numericQuota } : {}),
        };
        if (Object.keys(changes).length === 0) return;
        const updated = await updateAdminUser(action.account.id, changes, controller.signal);
        if (controller.signal.aborted) return;
        if (updated.id === actorId && (updated.disabled || updated.role !== action.account.role)) await onOwnSessionEnded();
        else { await onChanged(text.adminAccountSaved); onDismiss(); }
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(localizedError(failure, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay
      open={!suspended}
      testId="admin-action-dialog"
      title={title}
      description={description}
      initialFocus={action.kind === 'invite' ? email : action.kind === 'user' ? roleField : cancel}
      onDismiss={pending ? undefined : dismiss}
      restoreFallback={restoreActionFocus}
    >
      {issued ? (
        <div className="min-h-0 space-y-3 overflow-y-auto ux-scroll-contain p-5 sm:p-6">
          <label className="block space-y-1 text-sm font-medium">{text.issuedAccountLink}
            <input ref={linkInput} data-testid="admin-issued-url" className="field" value={issued.url} readOnly spellCheck={false} autoComplete="off" />
          </label>
          <p className="text-sm text-slate-700 dark:text-slate-300">{text.expiresAt} <time dateTime={issued.expiresAt}>{shareDateFormat(locale).format(new Date(issued.expiresAt))}</time> ({text.vietnamTime})</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="admin-copy-link" className="button button-secondary min-h-11" onClick={() => void copy()}>{text.shareCopy}</button>
            <button type="button" data-testid="admin-issued-close" className="button button-primary min-h-11" onClick={dismiss} disabled={pending}>{text.close}</button>
          </div>
          <p role="status" className={copyStatus ? 'text-sm text-slate-700 dark:text-slate-300' : 'sr-only'}>{copyStatus}</p>
        </div>
      ) : (
        <form method="post" onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-col">
          <div className="min-h-0 space-y-3 overflow-y-auto ux-scroll-contain p-5 sm:p-6">
            {action.kind === 'invite' && (
              <label className="block space-y-1 text-sm font-medium">{text.inviteEmail}
                <input ref={email} data-testid="admin-invite-email" name="email" className="field" type="email" autoComplete="off" maxLength={254} required readOnly={pending} />
              </label>
            )}
            {action.kind !== 'invite' && <p className="text-sm font-medium [overflow-wrap:anywhere]">{action.kind === 'revoke' ? action.invite.email : action.account.email}</p>}
            {action.kind === 'user' && (
              <>
                <label className="block space-y-1 text-sm font-medium">{text.accountRole}
                  <select ref={roleField} data-testid="admin-user-role" className="field" value={role} disabled={pending} onChange={(event) => setRole(event.currentTarget.value === 'admin' ? 'admin' : 'user')}>
                    <option value="user">{text.roleUser}</option><option value="admin">{text.roleAdmin}</option>
                  </select>
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                  <input data-testid="admin-user-lock" type="checkbox" className="h-5 w-5 accent-primary-600" checked={disabled} disabled={pending} onChange={(event) => setDisabled(event.currentTarget.checked)} />{text.lockAccount}
                </label>
                <div className="space-y-1.5">
                  <label className="block space-y-1 text-sm font-medium">{text.quotaInBytes}
                    <input data-testid="admin-user-quota" className="field font-mono" inputMode="numeric" maxLength={16} value={quota} readOnly={pending} onChange={(event) => setQuota(event.currentTarget.value)} />
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {parsedQuota !== null ? `= ${readableSize(parsedQuota, locale)}` : text.invalidQuota}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '512 MB', bytes: 512 * 1024 * 1024 },
                      { label: '1 GB', bytes: 1024 ** 3 },
                      { label: '2 GB', bytes: 2 * 1024 ** 3 },
                      { label: '5 GB', bytes: 5 * 1024 ** 3 },
                      { label: '10 GB', bytes: 10 * 1024 ** 3 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={pending}
                        onClick={() => setQuota(String(preset.bytes))}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{text.storageUsed} {readableSize(action.account.usedBytes, locale)}</p>
              </>
            )}
            {error && <p role="alert" data-testid="admin-action-error" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:px-6">
            <button type="button" ref={cancel} data-testid="admin-action-cancel" disabled={pending} onClick={dismiss} className="button button-secondary min-h-11">{text.cancel}</button>
            <button type="submit" data-testid="admin-action-submit" disabled={pending || unchanged} className={`button min-h-11 ${action.kind === 'revoke' ? 'button-danger' : 'button-primary'}`}>
              {pending ? text.saving : action.kind === 'user' ? text.save : title}
            </button>
          </div>
        </form>
      )}
    </Overlay>
  );
}
