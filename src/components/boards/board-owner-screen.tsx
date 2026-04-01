'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, searchDrive, type User } from '@/lib/api';
import {
  addBoardItem, createBoard, deleteBoard, deleteBoardItem, getBoard, listBoards,
  reorderBoardItems, updateBoard, updateBoardItem, type BoardDetail, type BoardSummary,
} from '@/lib/board-api';
import { readableSize } from '@/lib/file-details';
import { localizedError } from '@/lib/messages';
import { useAccountSession } from '../account-session';
import { DriveLayout } from '../drive/drive-layout';
import { Overlay } from '../overlay';
import { useLocale } from '../providers';

const boardText = {
  vi: {
    heading: 'Bảng của tôi', create: 'Tạo bảng', createDescription: 'Bảng mới được lưu dưới dạng nháp riêng tư.',
    empty: 'Bạn chưa tạo bảng nào.', title: 'Tên bảng', description: 'Mô tả', draft: 'Nháp riêng tư',
    link: 'Công bố qua link', discoverable: 'Hiển thị trong Khám phá', visibility: 'Quyền hiển thị',
    publicLink: 'Link công khai', openPublic: 'Mở bảng công khai', shareSettings: 'Cài đặt bảng',
    publishingHint: 'Khi công bố bảng, khách có thể thấy những tệp bạn đã bật công bố.',
    hidden: 'Bảng đang bị quản trị viên ẩn khỏi trang công khai.', copied: 'Đã chép link công khai.',
    manualCopy: 'Hãy sao chép link từ ô đã chọn.', copy: 'Chép link', saved: 'Đã lưu bảng.',
    items: 'Tệp trong bảng', attach: 'Thêm tệp', attachHint: 'Chọn tệp trong Drive của bạn.',
    search: 'Tìm tệp trong Drive của bạn', searchSubmit: 'Tìm tệp', noResults: 'Chưa tìm thấy tệp có thể thêm ở trang này.',
    add: 'Thêm', added: 'Đã thêm tệp.', noFiles: 'Bảng chưa có tệp.', unavailable: 'Tệp hiện không có trong Drive.',
    publish: 'Công bố tệp', allowDownload: 'Cho tải bản gốc', up: 'Lên', down: 'Xuống',
    remove: 'Gỡ tệp', removeQuestion: 'Tệp vẫn được giữ trong Drive của bạn.', removed: 'Đã gỡ tệp khỏi bảng.',
    delete: 'Xóa bảng', deleteQuestion: 'Bảng và link công khai sẽ bị xóa. Các tệp trong Drive vẫn được giữ.',
    alreadyAttached: 'Tệp này đã được thêm vào bảng.', itemLimit: 'Bảng đã có 100 tệp.',
    page: 'Trang', previous: 'Trang trước', next: 'Trang sau',
  },
  en: {
    heading: 'My boards', create: 'Create board', createDescription: 'New boards are saved as private drafts.',
    empty: 'You have no boards yet.', title: 'Board title', description: 'Description', draft: 'Private draft',
    link: 'Publish by link', discoverable: 'Show in Explore', visibility: 'Visibility',
    publicLink: 'Public link', openPublic: 'Open public board', shareSettings: 'Board settings',
    publishingHint: 'When you publish the board, visitors can see the files you have published.',
    hidden: 'An administrator has hidden this board from the public.', copied: 'Public link copied.',
    manualCopy: 'Copy the link from the selected field.', copy: 'Copy link', saved: 'Board saved.',
    items: 'Files in this board', attach: 'Add files', attachHint: 'Choose a file from your own Drive.',
    search: 'Search files in your Drive', searchSubmit: 'Search files', noResults: 'No eligible files on this page.',
    add: 'Add', added: 'File added.', noFiles: 'There are no files in this board.', unavailable: 'This file is unavailable in Drive.',
    publish: 'Publish file', allowDownload: 'Allow original download', up: 'Up', down: 'Down',
    remove: 'Remove file', removeQuestion: 'The file stays in your Drive.', removed: 'File removed from the board.',
    delete: 'Delete board', deleteQuestion: 'The board and public link will be removed. Your files stay in Drive.',
    alreadyAttached: 'This file is already attached.', itemLimit: 'The board already has 100 files.',
    page: 'Page', previous: 'Previous page', next: 'Next page',
  },
};

function useBoardText() {
  const { locale } = useLocale();
  return boardText[locale];
}

function useBoardWrite(expire: () => void) {
  const { text } = useLocale();
  const board = useBoardText();
  const inFlight = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => () => inFlight.current?.abort(), []);

  async function run(action: (signal: AbortSignal) => Promise<void>, message = '') {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setError('');
    setStatus('');
    try {
      await action(controller.signal);
      if (!controller.signal.aborted) setStatus(message);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) expire();
      else if (failure instanceof ApiError && failure.code === 'BOARD_ITEM_EXISTS') setError(board.alreadyAttached);
      else if (failure instanceof ApiError && failure.code === 'BOARD_ITEM_LIMIT') setError(board.itemLimit);
      else setError(localizedError(failure, text));
    } finally {
      inFlight.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return { pending, error, status, run, setStatus, clearError: () => setError('') };
}

function BoardPageShell({ session, children }: { session: ReturnType<typeof useAccountSession>; children: ReactNode }) {
  return <>
    <DriveLayout user={session.user} section="boards" signingOut={session.signingOut} signOutError={session.signOutError} onSignOut={() => void session.signOut()}>
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">{children}</div>
    </DriveLayout>
    {session.sessionDialog}
  </>;
}

function BoardError({ error, retry }: { error: unknown; retry: () => void }) {
  const { text } = useLocale();
  return <div role="alert" className="panel flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-red-800">
    <p>{localizedError(error, text)}</p>
    <button type="button" className="button button-secondary min-h-11" onClick={retry}>{text.retry}</button>
  </div>;
}

function BoardFormFields({ defaultTitle = '', defaultDescription = '', disabled, initialFocus }: {
  defaultTitle?: string; defaultDescription?: string; disabled: boolean; initialFocus?: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useBoardText();
  return <>
    <label className="block space-y-2 text-sm font-medium">
      <span>{t.title}</span>
      <input ref={initialFocus} name="title" className="field" data-testid="board-title" defaultValue={defaultTitle} required readOnly={disabled} maxLength={240} />
    </label>
    <label className="block space-y-2 text-sm font-medium">
      <span>{t.description}</span>
      <textarea name="description" rows={4} className="field resize-y" data-testid="board-description" defaultValue={defaultDescription} readOnly={disabled} maxLength={4000} />
    </label>
  </>;
}

function boardFields(form: HTMLFormElement) {
  const fields = new FormData(form);
  return { title: String(fields.get('title') ?? '').trim(), description: String(fields.get('description') ?? '').trim() || null };
}

function validateBoard(form: HTMLFormElement, error: string) {
  const data = boardFields(form);
  if (!data.title || [...data.title].length > 120 || [...(data.description ?? '')].length > 2000) {
    const field = form.elements.namedItem(!data.title || [...data.title].length > 120 ? 'title' : 'description');
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.setCustomValidity(error);
      field.reportValidity();
      field.setCustomValidity('');
    }
    return null;
  }
  return data;
}

function BoardPagination({ page, totalPages, href, update }: {
  page: number; totalPages: number; href?: (page: number) => string; update?: (page: number) => void;
}) {
  const t = useBoardText();
  if (totalPages <= 1 && page === 1) return null;
  const controls = [
    { page: page - 1, show: page > 1, label: t.previous },
    { page: page + 1, show: page < totalPages, label: t.next },
  ];
  return <nav aria-label={t.page} className="flex flex-wrap items-center gap-2 text-sm">
    <span>{t.page} {page}</span>
    {controls.filter(control => control.show).map(control => href
      ? <Link key={control.page} href={href(control.page)} className="button button-secondary min-h-11">{control.label}</Link>
      : <button key={control.page} type="button" className="button button-secondary min-h-11" onClick={() => update?.(control.page)}>{control.label}</button>)}
  </nav>;
}

export function BoardListScreen({ initialUser, page }: { initialUser: User; page: number }) {
  const listHref = (target: number) => target > 1 ? '/boards?page=' + target : '/boards';
  const session = useAccountSession(initialUser, listHref(page));
  const t = useBoardText();
  const { text } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const { expire } = session;
  const write = useBoardWrite(expire);
  const query = useQuery({
    queryKey: ['boards', session.user.id, page],
    queryFn: ({ signal }) => listBoards(page, signal),
    enabled: !session.expired, refetchOnMount: 'always',
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) expire();
  }, [query.error, expire]);

  function close() {
    if (write.pending) return;
    write.clearError();
    setCreating(null);
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = validateBoard(event.currentTarget, text.invalidRequest);
    if (!data) return;
    void write.run(async signal => {
      const result = await createBoard(data, signal);
      if (signal.aborted) return;
      await queryClient.invalidateQueries({ queryKey: ['boards', session.user.id] });
      if (!signal.aborted) router.push('/boards/' + result.id);
    });
  }

  const listing = !query.error && !session.expired ? query.data : undefined;

  return <BoardPageShell session={session}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{t.heading}</h1>
      <button data-testid="board-create-open" type="button" className="button button-primary min-h-11" onClick={event => setCreating(event.currentTarget)}>{t.create}</button>
    </header>
    {query.isPending && !session.expired && <p role="status" className="panel p-4 text-sm">{text.loading}</p>}
    {query.error && !session.expired && <BoardError error={query.error} retry={() => void query.refetch()} />}
    {listing && <>
      {listing.data.items.length ? <ul className="grid gap-3 sm:grid-cols-2">
        {listing.data.items.map(board => <li key={board.id} className="panel min-w-0 p-4" data-testid="owner-board-card" data-board-id={board.id}>
          <Link href={'/boards/' + board.id} className="block min-h-11 break-words font-semibold text-primary-800 hover:underline">{board.title}</Link>
          <p className="text-sm text-gray-600">{t[board.visibility]}</p>
          {board.hiddenAt && <p className="mt-2 text-sm text-amber-900">{t.hidden}</p>}
        </li>)}
      </ul> : <p className="panel p-4 text-sm">{t.empty}</p>}
      <BoardPagination page={page} totalPages={listing.pagination.totalPages} href={listHref} />
    </>}
    {creating && !session.expired && <Overlay
      testId="board-create-dialog" title={t.create} description={t.createDescription}
      initialFocus={input} restoreFocus={creating} onDismiss={close}
    >
      <form onSubmit={create} className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6">
        <BoardFormFields disabled={write.pending} initialFocus={input} />
        {write.error && <p role="alert" className="text-sm text-red-800">{write.error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="button button-secondary min-h-11" disabled={write.pending} onClick={close}>{text.cancel}</button>
          <button type="submit" className="button button-primary min-h-11" data-testid="board-create-submit" disabled={write.pending}>{t.create}</button>
        </div>
      </form>
    </Overlay>}
  </BoardPageShell>;
}

type DetailWrite = ReturnType<typeof useBoardWrite>;

export function BoardDetailScreen({ initialUser, boardId }: { initialUser: User; boardId: string }) {
  const session = useAccountSession(initialUser, '/boards/' + boardId);
  const t = useBoardText();
  const { locale, text } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const heading = useRef<HTMLHeadingElement | null>(null);
  const cancel = useRef<HTMLButtonElement | null>(null);
  const publicLink = useRef<HTMLInputElement | null>(null);
  const focusAfterSettings = useRef(false);
  const [attaching, setAttaching] = useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState<{ action: 'board' | 'item'; itemId?: string; trigger: HTMLElement } | null>(null);
  const { expire } = session;
  const write = useBoardWrite(expire);
  const queryKey = ['board', session.user.id, boardId] as const;
  const query = useQuery({
    queryKey, queryFn: ({ signal }) => getBoard(boardId, signal),
    enabled: !session.expired, refetchOnMount: 'always',
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) expire();
  }, [query.error, expire]);

  const board = !query.error && !session.expired ? query.data : undefined;
  const publicHref = board && board.visibility !== 'draft' && !board.hiddenAt ? '/public/boards/' + board.publicId : null;
  const settingsKey = board ? JSON.stringify([board.title, board.description, board.visibility]) : '';

  useLayoutEffect(() => {
    if (focusAfterSettings.current) {
      focusAfterSettings.current = false;
      heading.current?.focus();
    }
  }, [settingsKey]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['boards', session.user.id] }),
    ]);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = validateBoard(event.currentTarget, text.invalidRequest);
    if (!data) return;
    const visibility = new FormData(event.currentTarget).get('visibility') as BoardSummary['visibility'];
    const settings = event.currentTarget;
    void write.run(async signal => {
      const result = await updateBoard(boardId, { ...data, visibility }, signal);
      if (signal.aborted) return;
      const changed = JSON.stringify([result.title, result.description, result.visibility]) !== settingsKey;
      focusAfterSettings.current = changed && (settings.contains(document.activeElement) || document.activeElement === document.body);
      queryClient.setQueryData<BoardDetail>(queryKey, previous => previous && { ...previous, ...result });
      await refresh();
    }, t.saved);
  }

  function changeItem(itemId: string, patch: { published?: boolean; allowDownload?: boolean }) {
    if (write.pending) return;
    void write.run(async signal => {
      const result = await updateBoardItem(boardId, itemId, patch, signal);
      if (signal.aborted) return;
      queryClient.setQueryData<BoardDetail>(queryKey, previous => previous && {
        ...previous, items: previous.items.map(item => item.id === itemId ? result : item),
      });
    }, t.saved);
  }

  function moveItem(index: number, step: -1 | 1) {
    if (!board || write.pending) return;
    const ids = board.items.map(item => item.id);
    const target = index + step;
    const moving = ids[index];
    const adjacent = ids[target];
    if (!moving || !adjacent) return;
    ids[index] = adjacent;
    ids[target] = moving;
    void write.run(async signal => {
      await reorderBoardItems(boardId, ids, signal);
      if (!signal.aborted) await refresh();
    }, t.saved);
  }

  function closeDialog() {
    if (write.pending) return;
    write.clearError();
    setAttaching(null);
    setConfirming(null);
  }

  function confirmDelete() {
    if (!confirming) return;
    const itemId = confirming.itemId;
    void write.run(async signal => {
      if (itemId) {
        await deleteBoardItem(boardId, itemId, signal);
        if (signal.aborted) return;
        await refresh();
        if (!signal.aborted) setConfirming(null);
      } else {
        await deleteBoard(boardId, signal);
        if (signal.aborted) return;
        await queryClient.invalidateQueries({ queryKey: ['boards', session.user.id] });
        if (!signal.aborted) router.push('/boards');
      }
    }, itemId ? t.removed : undefined);
  }

  async function copyLink() {
    if (!publicHref || !publicLink.current) return;
    const absolute = new URL(publicHref, location.origin).href;
    try {
      await navigator.clipboard.writeText(absolute);
      write.setStatus(t.copied);
    } catch {
      publicLink.current.focus();
      publicLink.current.select();
      write.setStatus(t.manualCopy);
    }
  }

  return <BoardPageShell session={session}>
    <Link href="/boards" className="button button-secondary min-h-11">{t.heading}</Link>
    <h1 data-testid="board-heading" ref={heading} tabIndex={-1} className="break-words text-xl font-semibold">{board?.title ?? t.shareSettings}</h1>
    {query.isPending && !session.expired && <p role="status" className="panel p-4 text-sm">{text.loading}</p>}
    {query.error && !session.expired && <BoardError error={query.error} retry={() => void query.refetch()} />}
    <p data-testid="board-status" role="status" className={write.status ? 'text-sm text-emerald-800' : 'sr-only'}>{write.status}</p>
    {write.error && !confirming && !attaching && <p role="alert" className="text-sm text-red-800">{write.error}</p>}
    {board && <>
      <section className="panel space-y-4 p-4 sm:p-5" aria-labelledby="board-settings">
        <h2 id="board-settings" className="font-semibold">{t.shareSettings}</h2>
        {board.hiddenAt && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{t.hidden}</p>}
        <form key={settingsKey} onSubmit={save} className="space-y-4">
          <BoardFormFields defaultTitle={board.title} defaultDescription={board.description ?? ''} disabled={write.pending} />
          <label className="block space-y-2 text-sm font-medium">
            <span>{t.visibility}</span>
            <select name="visibility" data-testid="board-visibility" className="field" disabled={write.pending} defaultValue={board.visibility} aria-describedby="board-publishing-hint">
              <option value="draft">{t.draft}</option><option value="link">{t.link}</option><option value="discoverable">{t.discoverable}</option>
            </select>
          </label>
          <p id="board-publishing-hint" className="text-sm text-gray-700">{t.publishingHint}</p>
          <button type="submit" data-testid="board-settings-save" className="button button-primary min-h-11" disabled={write.pending}>{text.save}</button>
        </form>
        {publicHref && <div className="flex flex-wrap items-end gap-2" key={publicHref}>
          <label className="min-w-0 grow basis-56 space-y-2 text-sm font-medium">
            <span>{t.publicLink}</span>
            <PublicLinkField input={publicLink} path={publicHref} />
          </label>
          <button className="button button-secondary min-h-11" type="button" onClick={() => void copyLink()}>{t.copy}</button>
          <Link className="button button-secondary min-h-11" href={publicHref} prefetch={false}>{t.openPublic}</Link>
        </div>}
      </section>

      <section className="panel space-y-4 p-4 sm:p-5" aria-labelledby="board-items">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="board-items" className="font-semibold">{t.items}</h2>
          <button data-testid="board-attach-open" type="button" className="button button-secondary min-h-11" aria-disabled={write.pending || board.items.length >= 100}
            onClick={event => { if (write.pending || board.items.length >= 100) return; write.clearError(); setAttaching(event.currentTarget); }}>{t.attach}</button>
        </header>
        {board.items.length ? <ol className="divide-y divide-gray-200">
          {board.items.map((item, index) => <li key={item.id} data-testid="board-item" data-item-id={item.id} className="min-w-0 space-y-2 py-3">
            <p className="break-words text-sm font-semibold">{item.originalName}</p>
            <p className="text-sm text-gray-600">{readableSize(item.size, locale)}{!item.available && ' · ' + t.unavailable}</p>
            <div className="flex flex-wrap items-center gap-x-4">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" data-testid="board-item-published" checked={item.published} disabled={!item.available} aria-disabled={write.pending}
                  onChange={event => changeItem(item.id, { published: event.currentTarget.checked })} />{t.publish}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" data-testid="board-item-download" checked={item.allowDownload} disabled={!item.available && !item.allowDownload} aria-disabled={write.pending}
                  onChange={event => changeItem(item.id, { allowDownload: event.currentTarget.checked })} />{t.allowDownload}
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="button button-secondary min-h-11" data-testid="board-item-move-up" aria-disabled={index === 0 || write.pending} aria-label={t.up + ': ' + item.originalName} onClick={() => moveItem(index, -1)}>{t.up}</button>
              <button type="button" className="button button-secondary min-h-11" data-testid="board-item-move-down" aria-disabled={index === board.items.length - 1 || write.pending} aria-label={t.down + ': ' + item.originalName} onClick={() => moveItem(index, 1)}>{t.down}</button>
              <button type="button" className="button button-secondary min-h-11" data-testid="board-item-remove" disabled={write.pending} aria-label={t.remove + ': ' + item.originalName}
                onClick={event => { write.clearError(); setConfirming({ action: 'item', itemId: item.id, trigger: event.currentTarget }); }}>{t.remove}</button>
            </div>
          </li>)}
        </ol> : <p className="text-sm text-gray-700">{t.noFiles}</p>}
      </section>

      <button type="button" data-testid="board-delete-open" className="button button-secondary min-h-11 text-red-800" disabled={write.pending}
        onClick={event => { write.clearError(); setConfirming({ action: 'board', trigger: event.currentTarget }); }}>{t.delete}</button>
      {attaching && <AttachDialog
        board={board} userId={session.user.id} opener={attaching} write={write} onDismiss={closeDialog}
        onSessionExpired={expire} onSelect={fileId => void write.run(async signal => {
          const added = await addBoardItem(boardId, fileId, signal);
          if (signal.aborted) return;
          queryClient.setQueryData<BoardDetail>(queryKey, previous => previous && { ...previous, items: [...previous.items, added] });
          setAttaching(null);
        }, t.added)}
      />}
      {confirming && <Overlay
        testId="board-delete-dialog" title={confirming.action === 'board' ? t.delete : t.remove}
        description={confirming.action === 'board' ? t.deleteQuestion : t.removeQuestion} onDismiss={closeDialog}
        restoreFocus={confirming.trigger} restoreFallback={() => heading.current?.focus()} initialFocus={cancel}
      >
        <div className="min-h-0 space-y-3 overflow-y-auto p-5 sm:p-6">
          {write.error && <p role="alert" className="text-sm text-red-800">{write.error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button ref={cancel} type="button" className="button button-secondary min-h-11" disabled={write.pending} onClick={closeDialog}>{text.cancel}</button>
            <button type="button" className="button button-danger min-h-11" data-testid="board-delete-confirm" disabled={write.pending} onClick={confirmDelete}>{confirming.action === 'board' ? t.delete : t.remove}</button>
          </div>
        </div>
      </Overlay>}
    </>}
  </BoardPageShell>;
}

function subscribeToOrigin() {
  return () => {};
}

function PublicLinkField({ input, path }: { input: React.RefObject<HTMLInputElement | null>; path: string }) {
  const origin = useSyncExternalStore(subscribeToOrigin, () => location.origin, () => '');
  const url = origin ? new URL(path, origin).href : path;
  return <input ref={input} data-testid="board-public-link" readOnly value={url} className="field" onFocus={event => event.currentTarget.select()} />;
}

function AttachDialog({ board, userId, opener, write, onDismiss, onSessionExpired, onSelect }: {
  board: BoardDetail; userId: string; opener: HTMLElement | null; write: DetailWrite;
  onDismiss: () => void; onSessionExpired: () => void; onSelect: (id: string) => void;
}) {
  const t = useBoardText();
  const { text } = useLocale();
  const input = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState({ q: '', page: 1 });
  const query = useQuery({
    queryKey: ['board-attach-search', userId, search.q, search.page],
    queryFn: ({ signal }) => searchDrive({ ...search, type: 'files', sort: 'name', includeMetadata: false }, signal),
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) onSessionExpired();
  }, [query.error, onSessionExpired]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch({ q: [...(input.current?.value.trim() ?? '')].slice(0, 255).join(''), page: 1 });
  }

  const results = !query.error ? query.data : undefined;
  const files = results?.data.items.flatMap(({ item, breadcrumbs }) => item.kind === 'file' && !board.items.some(existing => existing.fileId === item.id) ? [{ item, breadcrumbs }] : []);
  return <Overlay testId="board-attach-dialog" title={t.attach} description={t.attachHint} initialFocus={input} restoreFocus={opener} onDismiss={onDismiss}>
    <div className="min-h-0 space-y-3 overflow-y-auto p-5 sm:p-6">
      <form role="search" onSubmit={submit} className="flex flex-wrap gap-2">
        <input ref={input} type="search" className="field min-w-0 grow basis-48" aria-label={t.search} placeholder={t.search} data-testid="board-file-search" maxLength={510} />
        <button type="submit" className="button button-secondary min-h-11">{t.searchSubmit}</button>
      </form>
      {query.isPending && <p role="status" className="text-sm">{text.loading}</p>}
      {query.error && <BoardError error={query.error} retry={() => void query.refetch()} />}
      {write.error && <p role="alert" className="text-sm text-red-800">{write.error}</p>}
      {results && <>
        {files?.length ? <ul className="divide-y divide-gray-200">
          {files.map(({ item, breadcrumbs }) => <li key={item.id} data-testid="board-file-result" className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 grow basis-44 break-words">
              <p className="text-sm font-medium">{item.originalName}</p>
              <p className="text-xs text-gray-600">{breadcrumbs.length ? breadcrumbs.map(crumb => crumb.name).join(' › ') : text.myDrive}</p>
            </div>
            <button type="button" className="button button-secondary min-h-11" data-testid="board-file-add" disabled={write.pending}
              aria-label={t.add + ': ' + item.originalName} onClick={() => onSelect(item.id)}>{t.add}</button>
          </li>)}
        </ul> : <p className="text-sm text-gray-700">{t.noResults}</p>}
        <BoardPagination page={search.page} totalPages={results.pagination.totalPages} update={page => setSearch(previous => ({ ...previous, page }))} />
      </>}
    </div>
  </Overlay>;
}
