'use client';

import { ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect } from 'react';
import { ApiError, downloadUrl, getFile, type User } from '@/lib/api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { fileHref } from '@/lib/routes';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { useLocale } from '../providers';

export function FileDetailScreen({ initialUser, fileId }: { initialUser: User; fileId: string }) {
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, fileHref(fileId));
  const { text, locale } = useLocale();
  const query = useQuery({
    queryKey: ['file', user.id, fileId],
    queryFn: ({ signal }) => getFile(fileId, signal),
    enabled: !expired,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const { error, data: file } = query;
  const requestError = error && !(error instanceof ApiError && error.status === 401) ? error : null;
  const unavailable = error instanceof ApiError && [403, 404].includes(error.status);
  const checkingAccess = query.isPending || (!query.isFetchedAfterMount && query.isFetching);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) expire();
  }, [error, expire]);

  return (
    <>
      <DriveLayout user={user} section="file" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6 lg:p-8">
          <Link href="/shared-with-me" prefetch={false} className="inline-flex rounded-sm text-sm font-medium text-primary-800 hover:underline">{text.backToShared}</Link>
          <h1 className="text-lg font-semibold text-gray-900">{text.fileDetails}</h1>
          {checkingAccess && !expired && !requestError && (
            <div data-testid="file-detail-loading" role="status" aria-busy="true" className="panel h-44 max-w-3xl bg-gray-100 motion-safe:animate-pulse"><span className="sr-only">{text.loading}</span></div>
          )}
          {requestError && (
            <div data-testid="file-detail-error" role="alert" className="max-w-3xl space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
              {unavailable && <h2 className="font-semibold">{text.fileUnavailable}</h2>}
              <p>{localizedError(requestError, text)}</p>
              {!unavailable && <button type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>}
            </div>
          )}
          {file && !error && !expired && !checkingAccess && (
            <article data-testid="file-detail" aria-labelledby="file-detail-name" className="panel max-w-3xl space-y-5 p-4 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-800"><DocumentIcon aria-hidden="true" className="h-6 w-6" /></span>
                <h2 id="file-detail-name" className="min-w-0 break-words text-lg font-semibold sm:text-xl">{file.originalName}</h2>
              </div>
              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-gray-600">{text.fileSize}</dt><dd>{readableSize(file.size, locale)}</dd>
                <dt className="font-medium text-gray-600">{text.fileType}</dt><dd className="break-all">{file.mimeType}</dd>
                {file.description && <><dt className="font-medium text-gray-600">{text.fileDescription}</dt><dd className="whitespace-pre-wrap break-words">{file.description}</dd></>}
                {file.tags.length > 0 && <><dt className="font-medium text-gray-600">{text.fileTags}</dt><dd className="break-words">{file.tags.join(', ')}</dd></>}
              </dl>
              <a data-testid="file-detail-download" href={downloadUrl(file.id)} download={file.originalName} className="button button-primary min-h-11"><ArrowDownTrayIcon aria-hidden="true" className="h-5 w-5" />{text.download}</a>
            </article>
          )}
        </div>
      </DriveLayout>
      {sessionDialog}
    </>
  );
}
