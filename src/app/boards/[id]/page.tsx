import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { BoardDetailScreen } from '@/components/boards/board-owner-screen';
import { isFileId, loginHref } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Quản lý bảng' };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isFileId(id)) notFound();
  const user = await readServerUser();
  if (!user) redirect(loginHref(`/boards/${id}`));
  return <BoardDetailScreen key={`${user.id}:${id}`} initialUser={user} boardId={id} />;
}
