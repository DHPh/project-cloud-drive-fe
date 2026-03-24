export type DriveView = 'grid' | 'list';
export type SharedTab = 'files' | 'folders';
export type SearchParams = Record<string, string | string[] | undefined>;
export type DriveSearchType = 'all' | 'files' | 'folders';
export type DriveSearchSort = 'name' | 'newest';
export const timelineTypes = ['all', 'image', 'video', 'audio', 'pdf', 'document', 'other'] as const;
export type TimelineType = typeof timelineTypes[number];
export type DriveSearchFilters = { q: string; includeMetadata: boolean; type: DriveSearchType; sort: DriveSearchSort; page: number };
export type TimelineFilters = { from: string; to: string; type: TimelineType; page: number };

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

export function sharedHref(page = 1, tab: SharedTab = 'files') {
  const params = new URLSearchParams();
  if (tab === 'folders') params.set('tab', tab);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/shared-with-me?${query}` : '/shared-with-me';
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
  if (typeof value !== 'string' || !(/^\/(drive(?:\/(?:search|timeline))?|trash|shared-with-me)(\?|$)/.test(value) || fileRouteRegex.test(value))) return '/drive';
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

type ParamsReader = Pick<URLSearchParams, 'get'>;

export function searchParamsReader(params: SearchParams): ParamsReader {
  return { get: (name) => typeof params[name] === 'string' ? params[name] : null };
}

export function readDriveSearch(params: ParamsReader): DriveSearchFilters {
  const type = params.get('type');
  return {
    q: [...(params.get('q') ?? '').trim()].slice(0, 255).join(''),
    includeMetadata: params.get('includeMetadata') === 'true',
    type: type === 'files' || type === 'folders' ? type : 'all',
    sort: params.get('sort') === 'newest' ? 'newest' : 'name',
    page: pageNumber(params.get('page')),
  };
}

export function readTimeline(params: ParamsReader): TimelineFilters {
  const type = timelineTypes.find((candidate) => candidate === params.get('type'));
  return { from: params.get('from') ?? '', to: params.get('to') ?? '', type: type ?? 'all', page: pageNumber(params.get('page')) };
}

export function driveSearchQuery(filters: DriveSearchFilters) {
  const query = new URLSearchParams();
  if (filters.q) query.set('q', filters.q);
  if (filters.includeMetadata) query.set('includeMetadata', 'true');
  if (filters.type !== 'all') query.set('type', filters.type);
  if (filters.sort !== 'name') query.set('sort', filters.sort);
  if (filters.page > 1) query.set('page', String(filters.page));
  return query;
}

export function timelineQuery(filters: TimelineFilters) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.type !== 'all') query.set('type', filters.type);
  if (filters.page > 1) query.set('page', String(filters.page));
  return query;
}

export function driveSearchHref(filters: DriveSearchFilters) {
  const search = driveSearchQuery(filters).toString();
  return search ? `/drive/search?${search}` : '/drive/search';
}

export function timelineHref(filters: TimelineFilters) {
  const search = timelineQuery(filters).toString();
  return search ? `/drive/timeline?${search}` : '/drive/timeline';
}
