export type DriveView = 'grid' | 'list';
export type SearchParams = Record<string, string | string[] | undefined>;

export function driveHref(folder: string, q = '', page = 1, view: DriveView = 'grid') {
  const params = new URLSearchParams();
  if (folder !== 'root') params.set('folder', folder);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  if (view === 'list') params.set('view', view);
  const query = params.toString();
  return query ? `/drive?${query}` : '/drive';
}

export function trashHref(page = 1) {
  return page === 1 ? '/trash' : `/trash?page=${page}`;
}

export function sharedHref(page = 1) {
  return page === 1 ? '/shared-with-me' : `/shared-with-me?page=${page}`;
}

const fileIdPattern = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const fileIdRegex = new RegExp(`^${fileIdPattern}$`, 'i');
const fileRouteRegex = new RegExp(`^/files/${fileIdPattern}$`, 'i');

export function isFileId(value: string) {
  return fileIdRegex.test(value);
}

export function fileHref(fileId: string) {
  return `/files/${encodeURIComponent(fileId)}`;
}

export function safeAppRedirect(value: string | string[] | null | undefined) {
  if (typeof value !== 'string' || !(/^\/(drive|trash|shared-with-me)(\?|$)/.test(value) || fileRouteRegex.test(value))) return '/drive';
  return value;
}

export function loginHref(redirect: string) {
  const dest = safeAppRedirect(redirect);
  return dest === '/drive' ? '/login' : `/login?${new URLSearchParams({ redirect: dest })}`;
}

export function incomingDriveHref(params: SearchParams) {
  const folder = typeof params.folder === 'string' ? params.folder : 'root';
  const q = typeof params.q === 'string' ? params.q : '';
  return driveHref(folder, q, pageNumber(typeof params.page === 'string' ? params.page : null), params.view === 'list' ? 'list' : 'grid');
}

export function pageNumber(value: string | null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 2_147_483_647 ? number : 1;
}
