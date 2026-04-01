import { ApiError } from './api';
import type { components, operations } from './api-schema';

export type BoardSummary = components['schemas']['BoardSummary'];
export type OwnedBoardItem = components['schemas']['OwnedBoardItem'];
export type BoardDetail = components['schemas']['BoardDetail'];
export type PublicBoard = components['schemas']['PublicBoard'];
export type PublicBoardDetail = components['schemas']['PublicBoardDetail'];
export type ModerationBoard = components['schemas']['ModerationBoard'];

type JsonResponse<T> = T extends { content: { 'application/json': infer Body } } ? Body : never;
type ResponseFor<Operation extends keyof operations, Status extends keyof operations[Operation]['responses']> =
  JsonResponse<operations[Operation]['responses'][Status]>;
type CreateBoard = components['schemas']['BoardCreateRequest'];
type UpdateBoard = components['schemas']['BoardUpdateRequest'];
type UpdateBoardItem = components['schemas']['BoardItemUpdateRequest'];

const base = '/api/v1';
const boardPath = (id: string) => `/boards/${encodeURIComponent(id)}`;
const itemPath = (boardId: string, itemId: string) => `${boardPath(boardId)}/items/${encodeURIComponent(itemId)}`;
const publicPath = (id: string) => `/public/boards/${encodeURIComponent(id)}`;
const publicItemPath = (boardId: string, itemId: string) => `${publicPath(boardId)}/items/${encodeURIComponent(itemId)}`;

async function json<T>(path: string, signal: AbortSignal, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    cache: 'no-store', signal, method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const payload: components['schemas']['ErrorResponse'] | null = await response.json().catch(() => null);
    const code = payload?.error?.code ?? (response.status === 401 ? 'SESSION_REQUIRED' : 'UNEXPECTED_RESPONSE');
    throw new ApiError(response.status, code);
  }
  return response.json();
}

export function listBoards(page: number, signal: AbortSignal) {
  return json<ResponseFor<'listBoards', 200>>(`/boards?page=${page}`, signal);
}

export async function createBoard(body: CreateBoard, signal: AbortSignal) {
  return (await json<ResponseFor<'createBoard', 201>>('/boards', signal, 'POST', body)).data;
}

export async function getBoard(id: string, signal: AbortSignal) {
  return (await json<ResponseFor<'getBoard', 200>>(boardPath(id), signal)).data;
}

export async function updateBoard(id: string, body: UpdateBoard, signal: AbortSignal) {
  return (await json<ResponseFor<'updateBoard', 200>>(boardPath(id), signal, 'PATCH', body)).data;
}

export async function deleteBoard(id: string, signal: AbortSignal) {
  return (await json<ResponseFor<'deleteBoard', 200>>(boardPath(id), signal, 'DELETE')).data;
}

export async function addBoardItem(boardId: string, fileId: string, signal: AbortSignal) {
  return (await json<ResponseFor<'addBoardItem', 201>>(`${boardPath(boardId)}/items`, signal, 'POST', { fileId })).data;
}

export async function updateBoardItem(boardId: string, itemId: string, body: UpdateBoardItem, signal: AbortSignal) {
  return (await json<ResponseFor<'updateBoardItem', 200>>(itemPath(boardId, itemId), signal, 'PATCH', body)).data;
}

export async function deleteBoardItem(boardId: string, itemId: string, signal: AbortSignal) {
  return (await json<ResponseFor<'deleteBoardItem', 200>>(itemPath(boardId, itemId), signal, 'DELETE')).data;
}

export async function reorderBoardItems(boardId: string, itemIds: string[], signal: AbortSignal) {
  return (await json<ResponseFor<'reorderBoardItems', 200>>(`${boardPath(boardId)}/items/order`, signal, 'PUT', { itemIds })).data;
}

export function listPublicBoards(page: number, signal: AbortSignal) {
  return json<ResponseFor<'listPublicBoards', 200>>(`/public/boards?page=${page}`, signal);
}

export async function getPublicBoard(id: string, signal: AbortSignal) {
  return (await json<ResponseFor<'getPublicBoard', 200>>(publicPath(id), signal)).data;
}

export async function getPublicBoardPreview(boardId: string, itemId: string, signal: AbortSignal) {
  return (await json<ResponseFor<'getPublicBoardPreview', 200>>(`${publicItemPath(boardId, itemId)}/preview`, signal)).data;
}

export function publicBoardDownloadUrl(boardId: string, itemId: string) {
  return `${base}${publicItemPath(boardId, itemId)}/download`;
}

export function listModerationBoards(page: number, signal: AbortSignal) {
  return json<ResponseFor<'listModerationBoards', 200>>(`/admin/boards?page=${page}`, signal);
}

export async function hidePublicBoard(boardId: string, signal: AbortSignal) {
  return (await json<ResponseFor<'hidePublicBoard', 200>>(`/admin${boardPath(boardId)}/hide`, signal, 'POST')).data;
}
