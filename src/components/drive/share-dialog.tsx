'use client';

import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, grantItemShare, listItemShares, revokeItemShare, type FolderItem, type ShareGrant } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { expiryFromVietnamInput, expiryToVietnamInput, shareDateFormat } from '@/lib/share-expiry';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';
import { useShareExpiryRefresh } from '../use-share-expiry-refresh';

type Props = {
  item: Pick<Extract<FolderItem, { kind: 'folder' }>, 'id' | 'kind' | 'name'> | Pick<Extract<FolderItem, { kind: 'file' }>, 'id' | 'kind' | 'originalName'>;
  itemLink: string;
  userId: string;
  trigger: HTMLElement;
  suspended: boolean;
  onDismiss: () => void;
  onExpired: () => void;
  initialAction?: { kind: 'renew' | 'revoke'; grant: ShareGrant };
  onChanged?: (message: string) => void;
  restoreFallback?: () => void;
};

export function ShareDialog({ item, itemLink, userId, trigger, suspended, onDismiss, onExpired, initialAction, onChanged, restoreFallback }: Props) {
  const { text, locale } = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const initialRenew = initialAction?.kind === 'renew' ? initialAction.grant : null;
  const [email, setEmail] = useState(initialRenew?.recipientEmail ?? '');
  const [expiry, setExpiry] = useState(initialRenew?.isActive ? expiryToVietnamInput(initialRenew.expiresAt) : '');
  const [access, setAccess] = useState<ShareGrant['access'] | null>(null);
  const [editing, setEditing] = useState<ShareGrant | null>(initialRenew);
  const [revoke, setRevoke] = useState<ShareGrant | null>(initialAction?.kind === 'revoke' ? initialAction.grant : null);
  const [discard, setDiscard] = useState(false);
  const [pending, setPending] = useState<'save' | 'revoke' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const expiryInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const revokeCancel = useRef<HTMLButtonElement>(null);
  const discardCancel = useRef<HTMLButtonElement>(null);
  const expiryBeforeEdit = editing?.isActive ? expiryToVietnamInput(editing.expiresAt) : '';
  const accessChanged = access !== null && access !== editing?.access;
  const dirty = editing ? expiry !== expiryBeforeEdit || accessChanged : Boolean(email.trim() || expiry || access);
  const dateFormat = shareDateFormat(locale);
  const folder = item.kind === 'folder';
  const itemName = item.kind === 'folder' ? item.name : item.originalName;
  const listKey = [folder ? 'folder-shares' : 'file-shares', userId, item.id] as const;
  const query = useQuery({
    queryKey: [...listKey, page],
    queryFn: ({ signal }) => listItemShares(item, page, signal),
    enabled: !suspended && !initialAction,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const items = initialAction ? [initialAction.grant] : query.data?.data.items ?? [];
  const pages = initialAction ? 0 : query.data?.pagination.totalPages ?? 0;
  const canSave = !pending && !revoke && !discard;
  useShareExpiryRefresh(suspended || initialAction ? undefined : query.data?.data.items, query.refetch);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) onExpired();
  }, [query.error, onExpired]);
  useEffect(() => { if (revoke) revokeCancel.current?.focus(); }, [revoke]);
  useEffect(() => { if (discard) discardCancel.current?.focus(); }, [discard]);

  function resetForm() {
    setEditing(null);
    setEmail('');
    setExpiry('');
    setAccess(null);
    setSaveError(null);
  }

  function dismiss() {
    if (request.current) return;
    if (revoke) {
      cancelRevoke();
      return;
    }
    if (dirty) setDiscard(true);
    else onDismiss();
  }

  function editGrant(grant: ShareGrant) {
    setEditing(grant);
    setEmail(grant.recipientEmail);
    setExpiry(grant.isActive ? expiryToVietnamInput(grant.expiresAt) : '');
    setAccess(null);
    setSaveError(null);
    setNotice('');
    expiryInput.current?.focus();
  }

  async function refreshGrants() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: ['outgoing-shares', userId] }),
    ]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || request.current) return;
    const explicitExpiry = expiry && expiry !== expiryBeforeEdit ? expiryFromVietnamInput(expiry) : undefined;
    if (explicitExpiry === null) {
      setSaveError(text.invalidShareExpiry);
      expiryInput.current?.focus();
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setPending('save');
    setSaveError(null);
    setNotice('');
    try {
      const result = await grantItemShare(item, { email: email.trim(), expiresAt: explicitExpiry, access: accessChanged ? access ?? undefined : undefined }, controller.signal);
      if (controller.signal.aborted) return;
      const message = `${text.shareGranted} ${dateFormat.format(new Date(result.expiresAt))} (${text.vietnamTime}).`;
      if (initialAction) {
        await refreshGrants();
        if (!controller.signal.aborted) {
          onChanged?.(message);
          onDismiss();
        }
        return;
      }
      resetForm();
      if (!editing?.isActive) setPage(1);
      setNotice(message);
      await refreshGrants();
      emailInput.current?.focus();
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setSaveError(localizedError(error, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  function cancelRevoke() {
    if (!revoke || request.current) return;
    if (initialAction) { onDismiss(); return; }
    const triggerId = `share-revoke-${revoke.recipientId}`;
    setRevoke(null);
    setRevokeError(null);
    requestAnimationFrame(() => document.getElementById(triggerId)?.focus());
  }

  async function confirmRevoke() {
    if (!revoke || request.current) return;
    const controller = new AbortController();
    const recipientId = revoke.recipientId;
    const row = items.findIndex((item) => item.recipientId === recipientId);
    const neighbor = row < 0 ? undefined : items[row + 1] ?? items[row - 1];
    request.current = controller;
    setPending('revoke');
    setRevokeError(null);
    setNotice('');
    try {
      await revokeItemShare(item, recipientId, controller.signal);
      if (controller.signal.aborted) return;
      if (initialAction) {
        await refreshGrants();
        if (!controller.signal.aborted) {
          onChanged?.(text.shareRevoked);
          onDismiss();
        }
        return;
      }
      if (editing?.recipientId === recipientId) resetForm();
      setRevoke(null);
      if (items.length === 1 && page > 1) setPage(page - 1);
      setNotice(text.shareRevoked);
      await refreshGrants();
      requestAnimationFrame(() => {
        const next = neighbor ? document.getElementById(`share-edit-${neighbor.recipientId}`) : null;
        (next ?? emailInput.current)?.focus();
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setRevokeError(localizedError(error, text));
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(itemLink);
      setNotice(text.shareCopied);
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setNotice(text.shareCopyFallback);
    }
  }

  return (
    <Overlay
      open={!suspended} testId="share-dialog"
      title={initialAction ? initialAction.kind === 'renew' ? text.renewShare : text.shareRevoke : folder ? text.shareFolderTitle : text.shareTitle}
      description={initialAction?.kind === 'revoke' ? text.singleRevokeDescription : folder ? text.shareFolderDescription : text.shareDescription}
      initialFocus={initialAction ? initialAction.kind === 'revoke' ? revokeCancel : expiryInput : emailInput} onDismiss={pending ? undefined : dismiss} restoreFocus={trigger}
      restoreFallback={restoreFallback ?? (() => document.getElementById('drive-main')?.focus())}
    >
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <p className="break-words text-sm font-semibold" title={itemName}>{itemName}</p>
        {!initialAction && <div>
          <label htmlFor="share-link" className="mb-1 block text-sm font-medium">{folder ? text.shareFolderLink : text.shareLink}</label>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <input ref={linkInput} id="share-link" data-testid="share-link" className="field min-w-0 flex-1" value={itemLink} readOnly />
            <button type="button" data-testid="share-copy" className="button button-secondary min-h-11" onClick={() => void copyLink()}>
              <ClipboardDocumentIcon aria-hidden="true" className="h-4 w-4" />{text.shareCopy}
            </button>
          </div>
        </div>}
        {initialAction?.kind !== 'revoke' && <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-lg border border-gray-200 p-3">
          <div>
            <label htmlFor="share-email" className="mb-1 block text-sm font-medium">{text.shareEmail}</label>
            <input ref={emailInput} id="share-email" data-testid="share-email" type="email" autoComplete="off" required maxLength={254} spellCheck={false}
              className="field" value={email} readOnly={Boolean(editing || pending)} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <label className="block space-y-1 text-sm font-medium">{text.shareAccessLabel}
            <select data-testid="share-access" className="field" value={access ?? editing?.access ?? ''} disabled={Boolean(pending)}
              onChange={(event) => setAccess(event.currentTarget.value === 'editor' ? 'editor' : event.currentTarget.value === 'viewer' ? 'viewer' : null)}>
              {!editing && <option value="">{text.defaultShareAccess}</option>}
              <option value="viewer">{text.readOnly}</option><option value="editor">{text.editingAccess}</option>
            </select>
          </label>
          <div>
            <label htmlFor="share-expiry" className="mb-1 block text-sm font-medium">{text.shareExpiry}</label>
            <input ref={expiryInput} id="share-expiry" data-testid="share-expiry" type="datetime-local" step={60} className="field min-w-0"
              value={expiry} readOnly={Boolean(pending)} aria-describedby="share-expiry-hint" onChange={(event) => setExpiry(event.target.value)} />
            <p id="share-expiry-hint" className="mt-1 text-xs text-gray-600">{text.shareExpiryHint}</p>
          </div>
          {saveError && <p data-testid="share-error" role="alert" className="text-sm text-red-800">{saveError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {editing && <button type="button" className="button button-secondary min-h-11" disabled={Boolean(pending)} onClick={initialAction ? dismiss : resetForm}>{text.cancel}</button>}
            <button type="submit" data-testid="share-submit" className="button button-primary min-h-11 aria-disabled:opacity-60" aria-disabled={!canSave} aria-busy={pending === 'save'}>
              {pending === 'save' ? text.shareSaving : editing ? text.shareSaveExpiry : text.shareGrant}
            </button>
          </div>
        </form>}
        <p role="status" data-testid="share-status" className={notice ? 'rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900' : 'sr-only'}>{notice}</p>
        {initialAction?.kind !== 'renew' && <section aria-labelledby="share-recipient-heading" className="space-y-2">
          <h3 id="share-recipient-heading" className="text-sm font-semibold">{text.shareRecipients}</h3>
          {!initialAction && query.isPending && !suspended && <p role="status" data-testid="share-loading" className="text-sm text-gray-600">{text.loading}</p>}
          {!initialAction && query.isError && !suspended && (
            <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <p>{localizedError(query.error, text)}</p>
              <button type="button" data-testid="share-retry" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>
            </div>
          )}
          {query.isSuccess && items.length === 0 && <p data-testid="share-empty" className="text-sm text-gray-600">{text.noShareRecipients}</p>}
          {items.length > 0 && (
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 px-3" aria-busy={query.isFetching}>
              {items.map((item) => (
                <li key={item.recipientId} data-testid="share-recipient" data-recipient-id={item.recipientId} data-recipient-status={item.isActive ? 'active' : 'expired'} className="py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{item.recipientName}</p>
                      <p className="break-all text-sm text-gray-600">{item.recipientEmail}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs ${item.isActive ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-100 text-gray-700'}`}>{item.isActive ? text.shareActive : text.shareExpired}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{text.expiresAt} <time data-testid="share-effective-expiry" dateTime={item.expiresAt}>{dateFormat.format(new Date(item.expiresAt))}</time> ({text.vietnamTime})</p>
                  <p data-testid="share-recipient-access" className="mt-1 text-sm text-gray-700">{item.access === 'editor' ? text.editingAccess : text.readOnly}</p>
                  {revoke?.recipientId === item.recipientId ? (
                    <div className="mt-2 space-y-2 rounded-md bg-amber-50 p-2 text-sm text-amber-950">
                      <p>{text.shareRevokePrompt}</p>
                      {revokeError && <p role="alert" className="text-red-800">{revokeError}</p>}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" ref={revokeCancel} data-testid="share-revoke-cancel" className="button button-secondary min-h-11" disabled={Boolean(pending)} onClick={cancelRevoke}>{text.cancel}</button>
                        <button type="button" data-testid="share-revoke-confirm" className="button button-danger min-h-11 aria-disabled:opacity-60" aria-busy={pending === 'revoke'} aria-disabled={Boolean(pending)} onClick={() => void confirmRevoke()}>{pending === 'revoke' ? text.shareRevoking : text.shareRevoke}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" id={`share-edit-${item.recipientId}`} data-testid="share-edit" className="button button-secondary min-h-11" disabled={!canSave} onClick={() => editGrant(item)}>{text.shareEdit}</button>
                      <button type="button" id={`share-revoke-${item.recipientId}`} data-testid="share-revoke" className="button button-secondary min-h-11 text-red-800" disabled={!canSave} onClick={() => { setNotice(''); setRevoke(item); }}>{text.shareRevoke}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>{text.page} {page} / {pages}</p>
              <div className="flex flex-wrap gap-2">
                {page > 1 && <button type="button" className="button button-secondary" disabled={!canSave} onClick={() => setPage(page - 1)}>{text.previousPage}</button>}
                {page < pages && <button type="button" className="button button-secondary" disabled={!canSave} onClick={() => setPage(page + 1)}>{text.nextPage}</button>}
              </div>
            </div>
          )}
        </section>}
        {discard && (
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            <p>{text.discardShare}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" ref={discardCancel} className="button button-secondary min-h-11" onClick={() => { setDiscard(false); (editing ? expiryInput : emailInput).current?.focus(); }}>{text.keepEditing}</button>
              <button type="button" className="button button-danger min-h-11" onClick={onDismiss}>{text.discard}</button>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-3 sm:px-6">
        <button type="button" data-testid="share-close" className="button button-secondary min-h-11" onClick={dismiss} disabled={Boolean(pending)}>{text.close}</button>
      </div>
    </Overlay>
  );
}
