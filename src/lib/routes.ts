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

export function safeDriveRedirect(value: string | string[] | null | undefined) {
  if (typeof value !== 'string' || (value !== '/drive' && !value.startsWith('/drive?'))) return '/drive';
  return value;
}

export function loginHref(redirect: string) {
  const dest = safeDriveRedirect(redirect);
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
