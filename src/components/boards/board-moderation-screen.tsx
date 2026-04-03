'use client';

import { ArrowLeftIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, type User } from '@/lib/api';
import { hidePublicBoard, listModerationBoards, type ModerationBoard } from '@/lib/board-api';
import { localizedError } from '@/lib/messages';
import { shareDateFormat } from '@/lib/share-expiry';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';
import { BoardPagination } from './board-pagination';

const copy = {
  vi: {
    title: 'Kiểm duyệt bảng',
    empty: 'Chưa có bảng đã công bố.',
    back: 'Về Quản trị',
    hide: 'Ẩn bảng',
    hideDescription: 'Bảng sẽ biến mất khỏi Khám phá và liên kết công khai sẽ ngừng hoạt động.',
    hidden: 'Đã ẩn',
    hiddenNotice: 'Đã ẩn bảng công khai.',
    visibility: { draft: 'Bản nháp', link: 'Công bố qua liên kết', discoverable: 'Hiển thị trong Khám phá' },
  },
  en: {
    title: 'Board moderation',
    empty: 'There are no published boards.',
    back: 'Back to administration',
    hide: 'Hide board',
    hideDescription: 'The board will disappear from Explore and its public link will stop working.',
    hidden: 'Hidden',
    hiddenNotice: 'The public board was hidden.',
    visibility: { draft: 'Draft', link: 'Published by link', discoverable: 'Listed in Explore' },
  },
};

type HideTarget = { board: ModerationBoard; trigger: HTMLButtonElement };

export function BoardModerationScreen({ initialUser, page }: { initialUser: User; page: number }) {
  const href = page === 1 ? '/admin/boards' : `/admin/boards?page=${page}`;
  const { user, expired, expire, signingOut, signOut, signOutError, sessionDialog } = useAccountSession(initialUser, href);
  const { locale, text } = useLocale();
  const labels = copy[locale];
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const [target, setTarget] = useState<HideTarget | null>(null);
  const [notice, setNotice] = useState(false);
  const canModerate = !expired && user.role === 'admin';
  const queryKey = ['moderation-boards', user.id, page] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listModerationBoards(page, signal),
    enabled: canModerate,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const error = query.error;
  const forbidden = error instanceof ApiError && error.status === 403;
  const requestError = error instanceof ApiError && error.status === 401 ? null : error;
  const checking = query.isPending || (!query.isFetchedAfterMount && query.isFetching);
  const data = canModerate && !error && !checking ? query.data : undefined;
  const dateFormat = shareDateFormat(locale);

  useEffect(() => { if (error instanceof ApiError && error.status === 401) expire(); }, [error, expire]);
  useEffect(() => { if (user.role !== 'admin') window.location.replace('/drive'); }, [user.role]);

  async function markHidden(hidden: ModerationBoard, hiddenAt: string) {
    await client.cancelQueries({ queryKey: ['moderation-boards', user.id] });
    client.setQueriesData<typeof query.data>({ queryKey: ['moderation-boards', user.id] }, (previous) => previous && ({
      ...previous,
      data: { items: previous.data.items.map((board) => board.id === hidden.id ? { ...board, hiddenAt } : board) },
    }));
    setTarget(null);
    setNotice(true);
    void client.invalidateQueries({ queryKey: ['moderation-boards', user.id] });
    void client.invalidateQueries({ queryKey: ['public-boards'] });
    void client.invalidateQueries({ queryKey: ['public-board', hidden.publicId] });
    void client.invalidateQueries({ queryKey: ['public-board-preview', hidden.publicId] });
    void client.invalidateQueries({ queryKey: ['board', user.id, hidden.id] });
    void client.invalidateQueries({ queryKey: ['boards', user.id] });
  }

  return (
    <>
      <DriveLayout user={user} section="admin" signingOut={signingOut} signOutError={signOutError} onSignOut={() => void signOut()}>
        <div className="mx-auto max-w-screen-lg space-y-4 p-4 sm:p-6 lg:p-8">
          <Link href="/admin" prefetch={false} className="button min-h-11 px-2 text-accent-text hover:bg-accent-soft">
            <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />{labels.back}
          </Link>
          <h1 ref={heading} tabIndex={-1} className="flex w-fit items-center gap-2 rounded-sm text-xl font-semibold text-ink">
            <ShieldCheckIcon aria-hidden="true" className="h-6 w-6 shrink-0 text-ink-muted" />{labels.title}
          </h1>
          <p role="status" data-testid="moderation-board-status" className={notice ? 'rounded-lg bg-success-soft px-3 py-2 text-sm text-success' : 'sr-only'}>{notice ? labels.hiddenNotice : ''}</p>
          {canModerate && checking && <p role="status" className="panel p-4 text-sm text-ink-secondary">{text.loading}</p>}
          {canModerate && requestError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-danger dark:border-red-900">
              <p>{localizedError(requestError, text)}</p>
              {!forbidden && <button type="button" className="button button-secondary min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>{text.retry}</button>}
            </div>
          )}
          {data?.data.items.length === 0 && <p className="panel p-4 text-sm text-ink-secondary">{labels.empty}</p>}
          {data && data.data.items.length > 0 && (
            <ul aria-label={labels.title} aria-busy={query.isFetching} className="space-y-2">
              {data.data.items.map((board) => (
                <li key={board.id} data-testid="moderation-board-row" data-board-id={board.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                  <div className="min-w-0 flex-[1_1_14rem] [overflow-wrap:anywhere]">
                    <h2 className="font-semibold text-ink">
                      {board.hiddenAt ? board.title : <Link href={`/public/boards/${encodeURIComponent(board.publicId)}`} prefetch={false} className="inline-flex min-h-11 items-center py-2 text-accent-text hover:underline">{board.title}</Link>}
                    </h2>
                    {board.hiddenAt ? (
                      <p className="mt-1 text-sm text-ink-secondary">{labels.hidden} · <time dateTime={board.hiddenAt}>{dateFormat.format(new Date(board.hiddenAt))}</time></p>
                    ) : <p className="text-sm text-ink-secondary">{labels.visibility[board.visibility]}</p>}
                  </div>
                  {!board.hiddenAt && (
                    <button type="button" data-testid="moderation-board-hide" className="button button-secondary min-h-11" aria-label={`${labels.hide}: ${board.title}`} onClick={(event) => {
                      setNotice(false);
                      setTarget({ board, trigger: event.currentTarget });
                    }}>{labels.hide}</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data && <BoardPagination page={page} totalPages={data.pagination.totalPages} path="/admin/boards" />}
        </div>
      </DriveLayout>
      {target && canModerate && !forbidden && (
        <HideBoardDialog
          target={target}
          onDismiss={() => setTarget(null)}
          onHidden={(hiddenAt) => markHidden(target.board, hiddenAt)}
          onSessionExpired={() => { setTarget(null); expire(); }}
          restoreFallback={() => heading.current?.focus()}
        />
      )}
      {sessionDialog}
    </>
  );
}

function HideBoardDialog({ target, onDismiss, onHidden, onSessionExpired, restoreFallback }: {
  target: HideTarget;
  onDismiss: () => void;
  onHidden: (hiddenAt: string) => Promise<void>;
  onSessionExpired: () => void;
  restoreFallback: () => void;
}) {
  const { locale, text } = useLocale();
  const labels = copy[locale];
  const cancel = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function hide() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const { hiddenAt } = await hidePublicBoard(target.board.id, controller.signal);
      await onHidden(hiddenAt);
    } catch (problem) {
      if (controller.signal.aborted) return;
      if (problem instanceof ApiError && problem.status === 401) onSessionExpired();
      else setError(problem);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Overlay testId="moderation-board-dialog" title={labels.hide} description={labels.hideDescription} initialFocus={cancel}
      onDismiss={pending ? undefined : onDismiss} restoreFocus={target.trigger} restoreFallback={restoreFallback}>
      <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4 text-sm sm:px-6">
        <p className="font-medium [overflow-wrap:anywhere]">{target.board.title}</p>
        {error !== null && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-danger">{localizedError(error, text)}</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-3 sm:px-6">
        <button ref={cancel} type="button" data-testid="moderation-board-cancel" className="button button-secondary min-h-11" disabled={pending} onClick={onDismiss}>{text.cancel}</button>
        <button type="button" data-testid="moderation-board-confirm" className="button button-danger min-h-11" aria-disabled={pending} onClick={() => void hide()}>{pending ? text.saving : labels.hide}</button>
      </footer>
    </Overlay>
  );
}
