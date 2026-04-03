'use client';

import { ArrowDownTrayIcon, ArrowRightIcon, PencilSquareIcon, TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, downloadUrl, getFile, type FileItem, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { getFileIcon } from '@/lib/file-icons';
import { localizedError } from '@/lib/messages';
import { driveHref, fileHref } from '@/lib/routes';
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

  return (
    <>
      <DriveLayout user={user} section="file" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          {!checkingAccess && !expired && (
            <Link data-testid="file-detail-back" href={ownerAccess ? driveHref(file.folderId ?? 'root') : '/shared-with-me'} prefetch={false} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
              {ownerAccess ? text.backToFolder : text.backToShared}
            </Link>
          )}
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{text.fileDetails}</h1>
          <p role="status" data-testid="file-metadata-status" className={saved ? 'max-w-3xl rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200' : 'sr-only'}>
            {saved ? text.fileMetadataSaved : ''}
          </p>
          {checkingAccess && !expired && !requestError && (
            <div data-testid="file-detail-loading" role="status" aria-busy="true" className="panel h-44 max-w-3xl bg-slate-100 motion-safe:animate-pulse dark:bg-slate-800">
              <span className="sr-only">{text.loading}</span>
            </div>
          )}
          {requestError && (
            <div data-testid="file-detail-error" role="alert" className="max-w-3xl space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
              {unavailable && <h2 className="font-semibold">{text.fileUnavailable}</h2>}
              <p>{localizedError(requestError, text)}</p>
              {!unavailable && <button type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>}
            </div>
          )}
          {file && !error && !expired && !checkingAccess && iconMeta && (
            <article data-testid="file-detail" aria-labelledby="file-detail-name" className="panel max-w-3xl space-y-5 p-4 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconMeta.classes}`}>
                  <iconMeta.Icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <h2 id="file-detail-name" className="min-w-0 break-words text-lg font-semibold sm:text-xl">{file.originalName}</h2>
              </div>
              {editorAccess && (
                <p data-testid="file-editor-access" className="w-fit rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-900 dark:bg-primary-950/60 dark:text-primary-200">
                  {text.editingAccess}
                </p>
              )}
              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-slate-600 dark:text-slate-400">{text.fileSize}</dt>
                <dd className="tabular-nums">{readableSize(file.size, locale)}</dd>
                <dt className="font-medium text-slate-600 dark:text-slate-400">{text.fileType}</dt>
                <dd className="break-all">{file.mimeType}</dd>
                {file.description && (
                  <>
                    <dt className="font-medium text-slate-600 dark:text-slate-400">{text.fileDescription}</dt>
                    <dd data-testid="file-detail-description" className="whitespace-pre-wrap [overflow-wrap:anywhere]">{file.description}</dd>
                  </>
                )}
                {file.tags.length > 0 && (
                  <>
                    <dt className="font-medium text-slate-600 dark:text-slate-400">{text.fileTags}</dt>
                    <dd className="min-w-0">
                      <ul className="flex flex-wrap gap-1.5" aria-label={text.fileTags}>
                        {file.tags.map((tag) => (
                          <li key={tag} data-testid="file-detail-tag" className="max-w-full whitespace-pre-wrap rounded-md bg-slate-100 px-2 py-1 text-slate-800 [overflow-wrap:anywhere] dark:bg-slate-800 dark:text-slate-200">
                            {tag}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </>
                )}
              </dl>
              <div className="flex flex-wrap gap-2">
                <a data-testid="file-detail-download" href={downloadUrl(file.id)} download={file.originalName} className="button button-primary min-h-11">
                  <ArrowDownTrayIcon aria-hidden="true" className="h-5 w-5" />
                  {text.download}
                </a>
                <button type="button" data-testid="file-preview-toggle" aria-expanded={previewOpen} aria-controls="file-preview-panel" className="button button-secondary min-h-11" onClick={() => setPreviewOpen(!previewOpen)}>
                  {previewOpen ? (locale === 'vi' ? 'Đóng xem trước' : 'Close preview') : (locale === 'vi' ? 'Xem trước' : 'Preview')}
                </button>
                {canEdit && (
                  <button
                    data-testid="file-detail-rename"
                    type="button"
                    className="button button-secondary min-h-11"
                    onClick={(event) => {
                      setSaved(false);
                      setEditing({ kind: 'rename', trigger: event.currentTarget, file });
                    }}
                  >
                    {text.rename}
                  </button>
                )}
                {canEdit && (
                  <button
                    data-testid="file-metadata-open"
                    type="button"
                    className="button button-secondary min-h-11"
                    onClick={(event) => {
                      setSaved(false);
                      setEditing({ kind: 'metadata', trigger: event.currentTarget, file });
                    }}
                  >
                    <PencilSquareIcon aria-hidden="true" className="h-5 w-5" />
                    {text.editFileMetadata}
                  </button>
                )}
                {ownerAccess && (
                  <>
                    <button
                      type="button"
                      className="button button-secondary min-h-11"
                      onClick={(event) => setEditing({ kind: 'share', trigger: event.currentTarget, file })}
                    >
                      <UserPlusIcon aria-hidden="true" className="h-5 w-5" />
                      {text.share}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary min-h-11"
                      onClick={(event) => setEditing({ kind: 'move', trigger: event.currentTarget, file })}
                    >
                      <ArrowRightIcon aria-hidden="true" className="h-5 w-5" />
                      {text.move}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary min-h-11 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      onClick={(event) => setEditing({ kind: 'trash', trigger: event.currentTarget, file })}
                    >
                      <TrashIcon aria-hidden="true" className="h-5 w-5" />
                      {text.moveToTrash}
                    </button>
                  </>
                )}
              </div>
              {previewOpen && (
                <section id="file-preview-panel" aria-label={locale === 'vi' ? 'Xem trước tệp' : 'File preview'} className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <FilePreview fileId={file.id} name={file.originalName} onExpired={expire} />
                </section>
              )}
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
          onDismiss={() => setEditing(null)}
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
