'use client';

import { ChevronLeftIcon, ChevronRightIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, listAdminAudit, listAdminInvites, listAdminUsers, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { adminHref, readAdminFilters, type AdminFilters } from '@/lib/routes';
import { publishSessionChange } from '@/lib/session-events';
import { shareDateFormat } from '@/lib/share-expiry';
import { useAccountSession } from '../account-session';
import { DriveLayout, DriveSearch } from '../drive/drive-layout';
import { useLocale } from '../providers';
import { AdminActionDialog, type AdminAction } from './admin-action-dialog';

export function AdminScreen({ initialUser }: { initialUser: User }) {
  const filters = readAdminFilters(useSearchParams());
  const href = adminHref(filters);
  const { user, expired, expire, signingOut, signOutError, signOut, sessionDialog } = useAccountSession(initialUser, href);
  const { text, locale } = useLocale();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AdminAction | null>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const enabled = !expired && user.role === 'admin';
  const prefix = ['admin', user.id] as const;
  const users = useQuery({
    queryKey: [...prefix, 'users', filters.page, filters.q],
    queryFn: ({ signal }) => listAdminUsers(filters.page, filters.q, signal), enabled: enabled && filters.tab === 'users', refetchOnMount: 'always',
  });
  const invites = useQuery({
    queryKey: [...prefix, 'invites', filters.page, filters.status],
    queryFn: ({ signal }) => listAdminInvites(filters.page, filters.status, signal), enabled: enabled && filters.tab === 'invites', refetchOnMount: 'always',
  });
  const audit = useQuery({
    queryKey: [...prefix, 'audit', filters.page],
    queryFn: ({ signal }) => listAdminAudit(filters.page, signal), enabled: enabled && filters.tab === 'audit', refetchOnMount: 'always',
  });
  const query = filters.tab === 'users' ? users : filters.tab === 'invites' ? invites : audit;
  const error = query.error;
  const data = !error && enabled ? query.data : undefined;
  const totalPages = data?.pagination.totalPages ?? 0;
  const tabs = { users: text.users, invites: text.invitations, audit: text.audit };
  const statuses = { all: text.allShareStatuses, active: text.shareActive, expired: text.shareExpired, used: text.invitationUsed, revoked: text.invitationRevoked };
  const actionNames: Record<string, string> = {
    invite_created: text.auditInviteCreated, invite_revoked: text.auditInviteRevoked, account_role_changed: text.auditRoleChanged,
    account_disabled: text.auditAccountDisabled, account_enabled: text.auditAccountEnabled, account_quota_changed: text.auditQuotaChanged,
    password_reset_issued: text.auditResetIssued,
  };
  const dateFormat = shareDateFormat(locale);

  useEffect(() => { if (error instanceof ApiError && error.status === 401) expire(); }, [error, expire]);
  useEffect(() => { if (user.role !== 'admin') window.location.replace('/drive'); }, [user.role]);

  function changeSearch(q: string) {
    if (q === filters.q) return;
    window.history.replaceState(null, '', adminHref({ ...filters, q, page: 1 }));
  }

  function changeStatus(status: AdminFilters['status']) {
    window.history.pushState(null, '', adminHref({ ...filters, status, page: 1 }));
  }

  function open(next: AdminAction) { setNotice(''); setAction(next); }

  function restoreActionFocus() {
    const triggerId = action?.trigger.id;
    window.requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const opener = triggerId ? document.getElementById(triggerId) : null;
      if (opener instanceof HTMLButtonElement && !opener.disabled) {
        opener.focus();
        if (document.activeElement === opener) return;
      }
      heading.current?.focus();
    });
  }

  async function onChanged(message?: string) {
    await queryClient.invalidateQueries({ queryKey: prefix });
    if (message) setNotice(message);
  }

  async function onOwnSessionEnded() {
    await queryClient.cancelQueries();
    queryClient.clear();
    publishSessionChange();
    window.location.replace('/login');
  }

  return (
    <>
      <DriveLayout user={user} section="admin" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <h1 id="admin-heading" ref={heading} tabIndex={-1} className="flex w-fit items-center gap-2 rounded-md px-1 text-lg font-semibold"><ShieldCheckIcon aria-hidden="true" className="h-6 w-6 text-gray-600" />{text.admin}</h1>
          <nav aria-label={text.admin} className="flex w-fit flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {(['users', 'invites', 'audit'] as const).map((tab) => (
              <Link key={tab} href={adminHref({ tab, q: '', status: 'all', page: 1 })} aria-current={filters.tab === tab ? 'page' : undefined} prefetch={false} data-testid={`admin-tab-${tab}`} className={`button min-h-11 ${tab === filters.tab ? 'bg-primary-100 text-primary-900' : 'text-gray-700 hover:bg-white'}`}>{tabs[tab]}</Link>
            ))}
            <Link href="/admin/boards" prefetch={false} data-testid="admin-boards-link" className="button min-h-11 text-gray-700 hover:bg-white">{locale === 'vi' ? 'Kiểm duyệt bảng' : 'Board moderation'}</Link>
          </nav>
          {filters.tab === 'users' && <DriveSearch search={filters.q} onSearch={changeSearch} label={text.adminSearch} testId="admin-user-search" />}
          {filters.tab === 'invites' && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="min-w-0 space-y-1 text-sm font-medium">{text.outgoingStatus}
                <select data-testid="admin-invite-status" className="field" value={filters.status} onChange={(event) => changeStatus(event.currentTarget.value as AdminFilters['status'])}>
                  {(['all', 'active', 'expired', 'used', 'revoked'] as const).map((status) => <option key={status} value={status}>{statuses[status]}</option>)}
                </select>
              </label>
              {enabled && <button id="admin-invite-create" type="button" data-testid="admin-invite-open" className="button button-primary min-h-11" onClick={(event) => open({ kind: 'invite', trigger: event.currentTarget })}>{text.createInvite}</button>}
            </div>
          )}
          <p role="status" data-testid="admin-notice" className={notice ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900' : 'sr-only'}>{notice}</p>
          {enabled && query.isPending && <p role="status" className="panel p-4 text-sm text-gray-600">{text.loading}</p>}
          {enabled && error && <div data-testid="admin-error" role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <p>{localizedError(error, text)}</p><button type="button" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
          </div>}
          {data?.data.items.length === 0 && <p role="status" className="panel p-4 text-sm text-gray-600">{text.adminEmpty}</p>}
          {enabled && !error && filters.tab === 'users' && users.data && (
            <ul className="space-y-2" aria-label={text.users}>
              {users.data.data.items.map((account) => (
                <li key={account.id} data-testid="admin-user-row" data-account-id={account.id} className="panel space-y-2 p-3 sm:flex sm:justify-between sm:gap-3 sm:space-y-0 sm:p-4">
                  <div className="min-w-0 space-y-1 text-sm [overflow-wrap:anywhere]">
                    <p className="font-semibold">{account.name}</p><p>{account.email}</p>
                    <p className="text-gray-700">{account.role === 'admin' ? text.roleAdmin : text.roleUser} · {account.disabled ? text.accountDisabled : text.accountEnabled}</p>
                    <p className="text-gray-700">{text.storageUsed} {readableSize(account.usedBytes, locale)} / {readableSize(account.quotaBytes, locale)}</p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <button id={`admin-user-edit-${account.id}`} type="button" data-testid="admin-user-edit" className="button button-secondary min-h-11" onClick={(event) => open({ kind: 'user', account, trigger: event.currentTarget })}>{text.editAdminAccount}</button>
                    <button id={`admin-user-reset-${account.id}`} type="button" data-testid="admin-user-reset" className="button button-secondary min-h-11" onClick={(event) => open({ kind: 'reset', account, trigger: event.currentTarget })}>{text.issueReset}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {enabled && !error && filters.tab === 'invites' && invites.data && (
            <ul className="space-y-2" aria-label={text.invitations}>
              {invites.data.data.items.map((invite) => (
                <li key={invite.id} data-testid="admin-invite-row" data-invite-id={invite.id} data-invite-status={invite.status} className="panel space-y-2 p-3 sm:flex sm:justify-between sm:gap-3 sm:space-y-0 sm:p-4">
                  <div className="min-w-0 space-y-1 text-sm [overflow-wrap:anywhere]">
                    <p className="font-semibold">{invite.email}</p><p>{statuses[invite.status]}</p>
                    <p className="text-gray-700">{text.expiresAt} <time dateTime={invite.expiresAt}>{dateFormat.format(new Date(invite.expiresAt))}</time> ({text.vietnamTime})</p>
                  </div>
                  {invite.status === 'active' && <button id={`admin-invite-revoke-${invite.id}`} type="button" data-testid="admin-invite-revoke" className="button button-secondary min-h-11 self-start text-red-800" onClick={(event) => open({ kind: 'revoke', invite, trigger: event.currentTarget })}>{text.revokeInvite}</button>}
                </li>
              ))}
            </ul>
          )}
          {enabled && !error && filters.tab === 'audit' && audit.data && (
            <ul className="space-y-2" aria-label={text.audit}>
              {audit.data.data.items.map((entry) => (
                <li key={entry.id} data-testid="admin-audit-row" data-action={entry.action} className="panel space-y-1 p-3 text-sm [overflow-wrap:anywhere] sm:p-4">
                  <p className="font-semibold">{actionNames[entry.action] ?? entry.action}</p>
                  <p>{text.auditActor} {entry.actorEmail}</p>
                  {entry.targetEmail && <p>{text.auditTarget} {entry.targetEmail}</p>}
                  <p className="text-gray-700"><time dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time> ({text.vietnamTime})</p>
                </li>
              ))}
            </ul>
          )}
          {enabled && data && (totalPages > 1 || filters.page > 1) && (
            <nav aria-label={text.pagination} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 text-sm">
              <p>{text.page} {filters.page} / {Math.max(1, totalPages)}</p>
              <div className="flex gap-1">
                {filters.page > 1 && <Link href={adminHref({ ...filters, page: Math.max(1, Math.min(totalPages, filters.page - 1)) })} prefetch={false} aria-label={text.previousPage} className="icon-button"><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></Link>}
                {filters.page < totalPages && <Link href={adminHref({ ...filters, page: filters.page + 1 })} prefetch={false} aria-label={text.nextPage} className="icon-button"><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></Link>}
              </div>
            </nav>
          )}
        </div>
      </DriveLayout>
      {action && <AdminActionDialog key={action.trigger.id} action={action} actorId={user.id} suspended={!enabled} onDismiss={() => setAction(null)} onExpired={expire} onChanged={onChanged}
        onOwnSessionEnded={onOwnSessionEnded} restoreActionFocus={restoreActionFocus} />}
      {sessionDialog}
    </>
  );
}
