'use client';

import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, downloadUrl, getFile, listItemShares, type FileItem, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { getFileIcon } from '@/lib/file-icons';
import { localizedError } from '@/lib/messages';
import { driveHref, fileHref } from '@/lib/routes';
import { shareDateFormat } from '@/lib/share-expiry';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { MoveDialog } from '../drive/folder-move-dialog';
import { RenameDialog } from '../drive/rename-dialog';
import { ShareDialog } from '../drive/share-dialog';
import { TrashDialog } from '../drive/trash-dialog';
import { useLocale, useToast } from '../providers';
import { FileMetadataDialog } from './file-metadata-dialog';
import { FilePreview } from './file-preview';

type DetailAction =
  | { kind: 'metadata' | 'rename' | 'share' | 'move' | 'trash'; trigger: HTMLElement; file: FileItem };

export function FileDetailScreen({ initialUser, fileId }: { initialUser: User; fileId: string }) {
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, fileHref(fileId));
  const { text, locale } = useLocale();
  const pushToast = useToast();
  const router = useRouter();
  const vi = locale === 'vi';
  const [editing, setEditing] = useState<DetailAction | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['file', user.id, fileId] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getFile(fileId, signal),
    enabled: !expired,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const { error, data: file } = query;
  const requestError = error && !(error instanceof ApiError && error.status === 401) ? error : null;
  const unavailable = error instanceof ApiError && [403, 404].includes(error.status);
  const checkingAccess = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const ownerAccess = file?.access === 'owner' && !error && !expired && !checkingAccess;
  const editorAccess = file?.access === 'editor' && !error && !expired && !checkingAccess;
  const canEdit = ownerAccess || editorAccess;
  const suspendedEditor = expired || (!checkingAccess && !canEdit);
  const suspendedOwner = expired || (!checkingAccess && !ownerAccess);

  const sharesQuery = useQuery({
    queryKey: ['file-shares', user.id, fileId],
    queryFn: ({ signal }) => listItemShares({ id: fileId, kind: 'file' }, 1, signal),
    enabled: ownerAccess && !expired,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) expire();
  }, [error, expire]);

  async function onMetadataSaved(updated: FileItem) {
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, (previous: typeof file) => previous && { ...previous, ...updated });
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ['drive', user.id] });
    setSaved(true);
    pushToast({ message: text.fileMetadataSaved });
  }

  const iconMeta = file ? getFileIcon(file.mimeType) : null;
  const dateFormat = shareDateFormat(locale);
  const grants = sharesQuery.data?.data.items ?? [];
  const backHref = file ? (ownerAccess ? driveHref(file.folderId ?? 'root') : '/shared-with-me') : '/drive';
  const backLabel = file ? (ownerAccess ? text.backToFolder : text.backToShared) : text.backToDrive;

  return (
    <>
      <DriveLayout user={user} section="file" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="flex min-h-full flex-col">
          {checkingAccess && !expired && !requestError && (
            <div data-testid="file-detail-loading" role="status" aria-busy="true" className="flex flex-1 flex-col lg:flex-row">
              <div className="flex-1 space-y-4 p-5 sm:p-6">
                <h1 className="sr-only">{text.fileDetails}</h1>
                <div className="h-14 rounded-xl border border-line bg-surface-subtle motion-safe:animate-pulse" />
                <div className="h-80 rounded-2xl border border-line bg-surface-subtle motion-safe:animate-pulse" />
              </div>
              <div className="w-full shrink-0 space-y-4 border-t border-line bg-surface-rail p-5 lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[360px]">
                <div className="h-36 rounded-xl border border-line bg-surface-canvas motion-safe:animate-pulse" />
                <div className="h-28 rounded-xl border border-line bg-surface-canvas motion-safe:animate-pulse" />
              </div>
              <span className="sr-only">{text.loading}</span>
            </div>
          )}

          {requestError && (
            <div className="mx-auto w-full max-w-2xl space-y-4 p-6 sm:p-10">
              {!checkingAccess && !expired && (
                <Link
                  data-testid="file-detail-back"
                  href={backHref}
                  prefetch={false}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink"
                >
                  <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />
                  {backLabel}
                </Link>
              )}
              <h1 className="text-lg font-semibold text-ink">{text.fileDetails}</h1>
              <div data-testid="file-detail-error" role="alert" className="space-y-3 rounded-2xl border border-red-200 bg-danger-soft p-5 text-danger dark:border-red-900">
                {unavailable && <h2 className="font-semibold">{text.fileUnavailable}</h2>}
                <p className="text-sm">{localizedError(requestError, text)}</p>
                {!unavailable && (
                  <button type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
                    {text.retry}
                  </button>
                )}
              </div>
            </div>
          )}

          {file && !error && !expired && !checkingAccess && iconMeta && (
            <article data-testid="file-detail" aria-labelledby="file-detail-name" className="flex min-h-full flex-1 flex-col lg:flex-row">
              <div className="flex min-w-0 flex-1 flex-col bg-surface-canvas">
                <header className="border-b border-line bg-surface-canvas px-4 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      data-testid="file-detail-back"
                      href={backHref}
                      prefetch={false}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-ink-secondary transition hover:bg-surface-hover hover:text-ink"
                    >
                      <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />
                      {backLabel}
                    </Link>
                    <p
                      role="status"
                      data-testid="file-metadata-status"
                      className={saved ? 'rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success' : 'sr-only'}
                    >
                      {saved ? text.fileMetadataSaved : ''}
                    </p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${iconMeta.classes}`}>
                        <iconMeta.Icon aria-hidden="true" className="h-6 w-6" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h1 id="file-detail-name" className="min-w-0 break-words text-lg font-bold tracking-tight text-ink sm:text-xl">
                            {file.originalName}
                          </h1>
                          {editorAccess && (
                            <span data-testid="file-editor-access" className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                              {text.editingAccess}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted tabular-nums">
                          {readableSize(file.size, locale)} · <span className="font-mono">{file.mimeType}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        data-testid="file-detail-download"
                        href={downloadUrl(file.id)}
                        download={file.originalName}
                        className="button button-primary min-h-10"
                      >
                        <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
                        {text.download}
                      </a>
                      <button
                        type="button"
                        data-testid="file-preview-toggle"
                        aria-expanded={previewOpen}
                        aria-controls="file-preview-panel"
                        className="button button-secondary min-h-10"
                        onClick={() => setPreviewOpen(!previewOpen)}
                      >
                        {previewOpen ? (
                          <>
                            <EyeSlashIcon aria-hidden="true" className="h-4 w-4" />
                            {text.closePreview}
                          </>
                        ) : (
                          <>
                            <EyeIcon aria-hidden="true" className="h-4 w-4" />
                            {text.previewFile}
                          </>
                        )}
                      </button>
                      {ownerAccess && (
                        <button
                          type="button"
                          className="button button-secondary min-h-10"
                          onClick={(event) => setEditing({ kind: 'share', trigger: event.currentTarget, file })}
                        >
                          <UserPlusIcon aria-hidden="true" className="h-4 w-4" />
                          {text.share}
                        </button>
                      )}
                    </div>
                  </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
                  {previewOpen ? (
                    <section
                      id="file-preview-panel"
                      aria-label={vi ? 'Xem trước tệp' : 'File preview'}
                      className="flex min-h-0 flex-1 flex-col"
                    >
                      <FilePreview fileId={file.id} name={file.originalName} onExpired={expire} />
                    </section>
                  ) : (
                    <div
                      className={`flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-rail/60 bg-gradient-to-br ${iconMeta.tint} px-6 py-14 text-center`}
                    >
                      <span className={`mb-4 flex h-20 w-20 items-center justify-center rounded-2xl shadow-sm ${iconMeta.classes}`}>
                        <iconMeta.Icon aria-hidden="true" className="h-10 w-10" />
                      </span>
                      <p className="max-w-md break-words text-base font-semibold text-ink">{file.originalName}</p>
                      <p className="mt-1 text-xs text-ink-muted tabular-nums">
                        {readableSize(file.size, locale)} · <span className="font-mono">{file.mimeType}</span>
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                        <button
                          type="button"
                          className="button button-primary min-h-10"
                          onClick={() => setPreviewOpen(true)}
                        >
                          <EyeIcon aria-hidden="true" className="h-4 w-4" />
                          {text.openPreview}
                        </button>
                        <a
                          href={downloadUrl(file.id)}
                          download={file.originalName}
                          className="button button-secondary min-h-10"
                        >
                          <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
                          {text.download}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <aside
                aria-label={text.fileDetails}
                className="flex w-full shrink-0 flex-col gap-5 border-t border-line bg-surface-rail p-5 lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[360px]"
              >
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">{text.fileDetails}</h2>
                  <dl className="space-y-2.5 rounded-xl border border-line bg-surface-canvas p-3.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-ink-muted">{text.fileSize}</dt>
                      <dd className="font-semibold tabular-nums text-ink">{readableSize(file.size, locale)}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-ink-muted">{text.fileType}</dt>
                      <dd className="break-all text-right font-mono text-xs text-ink">{file.mimeType}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-ink-muted">{text.fileCreated}</dt>
                      <dd className="text-right text-xs text-ink">{dateFormat.format(new Date(file.createdAt))}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-ink-muted">{text.updated}</dt>
                      <dd className="text-right text-xs text-ink">{dateFormat.format(new Date(file.updatedAt))}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
                      <dt className="shrink-0 text-ink-muted">{text.accessLevel}</dt>
                      <dd>
                        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                          {ownerAccess ? text.accessOwner : editorAccess ? text.editingAccess : text.readOnly}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                      {text.fileDescription} &amp; {text.fileTags}
                    </h2>
                    {canEdit && (
                      <button
                        data-testid="file-metadata-open"
                        type="button"
                        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-accent-text hover:bg-accent-soft"
                        onClick={(event) => {
                          setSaved(false);
                          setEditing({ kind: 'metadata', trigger: event.currentTarget, file });
                        }}
                      >
                        <PencilSquareIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        {text.editFileMetadata}
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-ink-secondary">{text.fileDescription}</p>
                    {file.description ? (
                      <p
                        data-testid="file-detail-description"
                        className="whitespace-pre-wrap rounded-xl border border-line bg-surface-canvas p-3 text-sm text-ink [overflow-wrap:anywhere]"
                      >
                        {file.description}
                      </p>
                    ) : (
                      <p className="text-xs italic text-ink-muted">{text.noDescriptionYet}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-ink-secondary">{text.fileTags}</p>
                    {file.tags.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5" aria-label={text.fileTags}>
                        {file.tags.map((tag) => (
                          <li
                            key={tag}
                            data-testid="file-detail-tag"
                            className="max-w-full whitespace-pre-wrap rounded-full border border-line bg-surface-canvas px-2.5 py-1 text-xs font-medium text-ink [overflow-wrap:anywhere]"
                          >
                            {tag}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-ink-muted">{text.noTagsYet}</p>
                    )}
                  </div>
                </section>

                {ownerAccess && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-ink-muted">
                        {text.shareRecipients} ({sharesQuery.data?.pagination.total ?? grants.length})
                      </h2>
                      <button
                        type="button"
                        onClick={(event) => setEditing({ kind: 'share', trigger: event.currentTarget, file })}
                        className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent-text hover:underline"
                      >
                        {text.manageShares}
                      </button>
                    </div>
                    {sharesQuery.isPending ? (
                      <div className="h-12 animate-pulse rounded-xl border border-line bg-surface-canvas" />
                    ) : grants.length > 0 ? (
                      <ul className="space-y-1.5">
                        {grants.slice(0, 3).map((grant) => (
                          <li key={grant.recipientId} className="rounded-xl border border-line bg-surface-canvas px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold text-ink">{grant.recipientName}</span>
                              <span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                                {grant.access === 'editor' ? text.editingAccess : text.readOnly}
                              </span>
                            </div>
                            <p className="truncate text-[11px] text-ink-muted">{grant.recipientEmail}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-ink-muted">{text.noShareRecipients}</p>
                    )}
                  </section>
                )}

                {(canEdit || ownerAccess) && (
                  <section className="mt-auto space-y-2 border-t border-line pt-4">
                    <h2 className="sr-only">{vi ? 'Thao tác tệp' : 'File actions'}</h2>
                    {canEdit && (
                      <button
                        data-testid="file-detail-rename"
                        type="button"
                        className="button button-secondary min-h-10 w-full justify-start"
                        onClick={(event) => {
                          setSaved(false);
                          setEditing({ kind: 'rename', trigger: event.currentTarget, file });
                        }}
                      >
                        <PencilSquareIcon aria-hidden="true" className="h-4 w-4" />
                        {text.rename}
                      </button>
                    )}
                    {ownerAccess && (
                      <>
                        <button
                          type="button"
                          className="button button-secondary min-h-10 w-full justify-start"
                          onClick={(event) => setEditing({ kind: 'move', trigger: event.currentTarget, file })}
                        >
                          <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />
                          {text.move}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary min-h-10 w-full justify-start text-danger hover:bg-danger-soft"
                          onClick={(event) => setEditing({ kind: 'trash', trigger: event.currentTarget, file })}
                        >
                          <TrashIcon aria-hidden="true" className="h-4 w-4" />
                          {text.moveToTrash}
                        </button>
                      </>
                    )}
                  </section>
                )}
              </aside>
            </article>
          )}
        </div>
      </DriveLayout>
      {editing?.kind === 'metadata' && <FileMetadataDialog file={editing.file} trigger={editing.trigger} suspended={suspendedEditor} onDismiss={() => setEditing(null)} onExpired={expire} onSaved={onMetadataSaved} />}
      {editing?.kind === 'rename' && <RenameDialog file={editing.file} trigger={editing.trigger} suspended={suspendedEditor} onDismiss={() => setEditing(null)} onSessionExpired={expire} onSaved={(updated) => void onMetadataSaved(updated)} />}
      {editing?.kind === 'share' && (
        <ShareDialog
          item={editing.file}
          itemLink={new URL(fileHref(editing.file.id), window.location.origin).href}
          userId={user.id}
          trigger={editing.trigger}
          suspended={suspendedOwner}
          onDismiss={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['file-shares', user.id, fileId] });
          }}
          onExpired={expire}
          restoreFallback={() => document.getElementById('file-main')?.focus()}
        />
      )}
      {editing?.kind === 'move' && (
        <MoveDialog
          item={editing.file}
          userId={user.id}
          trigger={editing.trigger}
          suspended={suspendedOwner}
          onDismiss={() => setEditing(null)}
          onExpired={expire}
          onMoved={(moved) => {
            if (moved.kind === 'file') {
              queryClient.setQueryData(queryKey, (previous: typeof file) => previous && { ...previous, ...moved });
            }
            void queryClient.invalidateQueries({ queryKey: ['drive', user.id] });
            void queryClient.invalidateQueries({ queryKey: ['folder-picker', user.id] });
            setEditing(null);
            pushToast({ message: text.fileMoved, href: driveHref((moved.kind === 'file' ? moved.folderId : null) ?? 'root'), hrefLabel: text.openMoveDestination });
          }}
          focusAfterMove={() => document.getElementById('file-main')?.focus()}
        />
      )}
      {editing?.kind === 'trash' && (
        <TrashDialog
          item={editing.file}
          trigger={editing.trigger}
          suspended={suspendedOwner}
          onDismiss={() => setEditing(null)}
          onExpired={expire}
          onMoved={() => {
            void queryClient.invalidateQueries({ queryKey: ['drive', user.id] });
            void queryClient.invalidateQueries({ queryKey: ['trash', user.id] });
            void queryClient.invalidateQueries({ queryKey: ['account', user.id] });
            setEditing(null);
            pushToast({ message: text.fileTrashed, href: '/trash', hrefLabel: text.trash });
            router.push(driveHref(editing.file.folderId ?? 'root'));
          }}
          focusAfterMove={() => document.getElementById('file-main')?.focus()}
        />
      )}
      {sessionDialog}
    </>
  );
}
