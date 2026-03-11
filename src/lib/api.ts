import type { components, operations } from './api-schema';

const apiBase = '/api/v1';

export type User = components['schemas']['User'];
export type FileItem = components['schemas']['FileSummary'];
export type FolderItem = components['schemas']['FolderItem'];
export type FolderSummary = components['schemas']['FolderSummary'];
type ErrorPayload = components['schemas']['ErrorResponse'];
type LoginRequest = operations['login']['requestBody']['content']['application/json'];
type UpdateFileRequest = operations['updateFile']['requestBody']['content']['application/json'];
type LoginResponse = operations['login']['responses'][200]['content']['application/json'];
type SessionResponse = operations['getCurrentUser']['responses'][200]['content']['application/json'];
type LogoutResponse = operations['logout']['responses'][200]['content']['application/json'];
type FolderResponse = operations['listFolderContents']['responses'][200]['content']['application/json'];
type FolderContentsType = NonNullable<operations['listFolderContents']['parameters']['query']>['type'];
type CreateFolderRequest = operations['createFolder']['requestBody']['content']['application/json'];
type UpdateFolderRequest = operations['updateFolder']['requestBody']['content']['application/json'];
type CreateFolderResponse = operations['createFolder']['responses'][201]['content']['application/json'];
type UpdateFolderResponse = operations['updateFolder']['responses'][200]['content']['application/json'];
type FileResponse = operations['uploadFile']['responses'][201]['content']['application/json'];
type UpdateFileResponse = operations['updateFile']['responses'][200]['content']['application/json'];
type TrashListResponse = operations['listTrash']['responses'][200]['content']['application/json'];
type TrashResponse = operations['trashFile']['responses'][200]['content']['application/json'];
type RestoreResponse = operations['restoreFile']['responses'][200]['content']['application/json'];
type FolderTrashResponse = operations['trashFolder']['responses'][200]['content']['application/json'];
type FolderRestoreResponse = operations['restoreFolder']['responses'][200]['content']['application/json'];
type PurgeResponse = operations['purgeTrashItem']['responses'][202]['content']['application/json'];
type EmptyTrashResponse = operations['emptyTrash']['responses'][202]['content']['application/json'];
type TrashEventRequest = operations['purgeTrashItem']['requestBody']['content']['application/json'];
type EmptyTrashRequest = operations['emptyTrash']['requestBody']['content']['application/json'];
type FileDetailResponse = operations['getFile']['responses'][200]['content']['application/json'];
type FileSharesResponse = operations['listFileShares']['responses'][200]['content']['application/json'];
type FolderSharesResponse = operations['listFolderShares']['responses'][200]['content']['application/json'];
type GrantShareRequest = operations['grantFileShare']['requestBody']['content']['application/json'] | operations['grantFolderShare']['requestBody']['content']['application/json'];
type GrantShareResponse = operations['grantFileShare']['responses'][200]['content']['application/json'] | operations['grantFolderShare']['responses'][200]['content']['application/json'];
type RevokeShareResponse = operations['revokeFileShare']['responses'][200]['content']['application/json'] | operations['revokeFolderShare']['responses'][200]['content']['application/json'];
type SharedFilesResponse = operations['listSharedFiles']['responses'][200]['content']['application/json'];
type SharedFoldersResponse = operations['listSharedFolders']['responses'][200]['content']['application/json'];
export type TrashItem = TrashListResponse['data']['items'][number];
export type ShareGrant = FileSharesResponse['data']['items'][number];

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

function failure(status: number, body: unknown) {
  if (body && typeof body === 'object' && 'success' in body && body.success === false && 'error' in body) {
    const error = body.error as Partial<ErrorPayload['error']> | null;
    if (typeof error?.code === 'string') return new ApiError(status, error.code);
  }

  return new ApiError(status, status === 401 ? 'SESSION_REQUIRED' : 'UNEXPECTED_RESPONSE');
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${apiBase}${path}`, { cache: 'no-store', ...options });
  if (!response.ok) {
    throw failure(response.status, await response.json().catch(() => null));
  }
  return response;
}

async function json<Response>(path: string, options?: RequestInit): Promise<Response> {
  return (await request(path, options)).json();
}

function jsonOptions(method: 'POST' | 'PATCH', body: LoginRequest | UpdateFileRequest | CreateFolderRequest | UpdateFolderRequest | TrashEventRequest | EmptyTrashRequest, signal?: AbortSignal): RequestInit {
  return { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, signal };
}

export async function login(credentials: LoginRequest) {
  return (await json<LoginResponse>('/auth/login', jsonOptions('POST', credentials))).data;
}

export async function currentUser(signal?: AbortSignal) {
  return (await json<SessionResponse>('/auth/me', { signal })).data;
}

export async function logout() {
  await json<LogoutResponse>('/auth/logout', { method: 'POST' });
}

export function listFolder(folder: string, search: string, page: number, signal: AbortSignal, type?: FolderContentsType) {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('q', search);
  if (type) query.set('type', type);
  return json<FolderResponse>(`/folders/${encodeURIComponent(folder)}/contents?${query}`, { signal });
}

export async function createFolder(data: CreateFolderRequest, signal: AbortSignal) {
  return (await json<CreateFolderResponse>('/folders', jsonOptions('POST', data, signal))).data;
}

export async function updateFolder(folderId: string, changes: UpdateFolderRequest, signal: AbortSignal) {
  return (await json<UpdateFolderResponse>(`/folders/${encodeURIComponent(folderId)}`, jsonOptions('PATCH', changes, signal))).data;
}

export async function renameFile(fileId: string, originalName: string, signal: AbortSignal) {
  return updateFile(fileId, { originalName }, signal);
}

export async function updateFile(fileId: string, changes: UpdateFileRequest, signal: AbortSignal) {
  return (await json<UpdateFileResponse>(`/files/${encodeURIComponent(fileId)}`, jsonOptions('PATCH', changes, signal))).data;
}

export function listTrash(page: number, signal: AbortSignal) {
  return json<TrashListResponse>(`/trash?page=${page}&includeFolders=true`, { signal });
}

export async function trashFile(fileId: string, signal: AbortSignal) {
  const result = await json<TrashResponse>(`/files/${encodeURIComponent(fileId)}/trash`, { method: 'POST', signal });
  return result.data;
}

export async function restoreFile(fileId: string, trashEventId: string, signal: AbortSignal) {
  const result = await json<RestoreResponse>(`/files/${encodeURIComponent(fileId)}/restore`, jsonOptions('POST', { trashEventId }, signal));
  return result.data;
}

export async function trashFolder(folderId: string, signal: AbortSignal) {
  return (await json<FolderTrashResponse>(`/folders/${encodeURIComponent(folderId)}/trash`, { method: 'POST', signal })).data;
}

export async function restoreFolder(folderId: string, trashEventId: string, signal: AbortSignal) {
  return (await json<FolderRestoreResponse>(`/folders/${encodeURIComponent(folderId)}/restore`, jsonOptions('POST', { trashEventId }, signal))).data;
}

export async function purgeTrashItem(item: Pick<TrashItem, 'id' | 'kind' | 'trashEventId'>, signal: AbortSignal) {
  const result = await json<PurgeResponse>(`/trash/${item.kind}/${encodeURIComponent(item.id)}/purge`, jsonOptions('POST', { trashEventId: item.trashEventId }, signal));
  return result.data;
}

export async function emptyTrash(requestId: string, signal: AbortSignal) {
  return (await json<EmptyTrashResponse>('/trash/empty', jsonOptions('POST', { requestId }, signal))).data;
}

export async function getFile(fileId: string, signal: AbortSignal) {
  return (await json<FileDetailResponse>(`/files/${encodeURIComponent(fileId)}`, { signal })).data;
}

function itemSharePath(item: Pick<FolderItem, 'id' | 'kind'>) {
  const collection = item.kind === 'folder' ? 'folders' : 'files';
  return `/${collection}/${encodeURIComponent(item.id)}/shares`;
}

export function listItemShares(item: Pick<FolderItem, 'id' | 'kind'>, page: number, signal: AbortSignal) {
  return json<FileSharesResponse | FolderSharesResponse>(`${itemSharePath(item)}?page=${page}`, { signal });
}

export async function grantItemShare(item: Pick<FolderItem, 'id' | 'kind'>, grant: GrantShareRequest, signal: AbortSignal) {
  return (await json<GrantShareResponse>(itemSharePath(item), {
    method: 'PUT', body: JSON.stringify(grant), headers: { 'Content-Type': 'application/json' }, signal,
  })).data;
}

export async function revokeItemShare(item: Pick<FolderItem, 'id' | 'kind'>, recipientId: string, signal: AbortSignal) {
  await json<RevokeShareResponse>(`${itemSharePath(item)}/${encodeURIComponent(recipientId)}`, { method: 'DELETE', signal });
}

export function listSharedItems(tab: 'files' | 'folders', page: number, signal: AbortSignal) {
  const path = tab === 'folders' ? '/shared-folders' : '/shared-with-me';
  return json<SharedFilesResponse | SharedFoldersResponse>(`${path}?page=${page}`, { signal });
}

export function downloadUrl(fileId: string) {
  return `${apiBase}/files/${encodeURIComponent(fileId)}/download`;
}

export function uploadFile(file: File, folder: string, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<FileItem>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const form = new FormData();
    form.append('file', file);
    if (folder !== 'root') form.append('folderId', folder);

    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.floor(100 * event.loaded / event.total));
    });
    xhr.addEventListener('load', () => {
      const payload: unknown = xhr.response;
      if (xhr.status === 201 && payload && typeof payload === 'object' && 'success' in payload && payload.success === true && 'data' in payload) {
        resolve((payload as FileResponse).data);
      } else {
        reject(failure(xhr.status, payload));
      }
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'UPLOAD_UNKNOWN')));
    xhr.addEventListener('timeout', () => reject(new ApiError(0, 'UPLOAD_UNKNOWN')));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload interrupted', 'AbortError')));
    xhr.addEventListener('loadend', () => signal.removeEventListener('abort', abort), { once: true });
    signal.addEventListener('abort', abort, { once: true });
    xhr.open('POST', `${apiBase}/files`);
    xhr.responseType = 'json';
    xhr.send(form);
  });
}
