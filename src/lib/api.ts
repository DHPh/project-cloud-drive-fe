import type { components, operations } from './api-schema';

const apiBase = '/api/v1';

export type User = components['schemas']['User'];
export type FileItem = components['schemas']['FileSummary'];
export type FolderItem = components['schemas']['FolderItem'];
type ErrorPayload = components['schemas']['ErrorResponse'];
type LoginRequest = operations['login']['requestBody']['content']['application/json'];
type RenameRequest = operations['updateFile']['requestBody']['content']['application/json'];
type LoginResponse = operations['login']['responses'][200]['content']['application/json'];
type SessionResponse = operations['getCurrentUser']['responses'][200]['content']['application/json'];
type LogoutResponse = operations['logout']['responses'][200]['content']['application/json'];
type FolderResponse = operations['listFolderContents']['responses'][200]['content']['application/json'];
type FileResponse = operations['uploadFile']['responses'][201]['content']['application/json'];
type RenameResponse = operations['updateFile']['responses'][200]['content']['application/json'];

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

function jsonOptions(method: 'POST' | 'PATCH', body: LoginRequest | RenameRequest, signal?: AbortSignal): RequestInit {
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

export function listFolder(folder: string, search: string, page: number, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('q', search);
  return json<FolderResponse>(`/folders/${encodeURIComponent(folder)}/contents?${query}`, { signal });
}

export async function renameFile(fileId: string, originalName: string, signal: AbortSignal) {
  const result = await json<RenameResponse>(`/files/${encodeURIComponent(fileId)}`, jsonOptions('PATCH', { originalName }, signal));
  return result.data;
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
