import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BoardModerationScreen } from '@/components/boards/board-moderation-screen';
import { loginHref, pageNumber, searchParamsReader, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Kiểm duyệt bảng' };

export default async function BoardModerationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const page = pageNumber(searchParamsReader(await searchParams).get('page'));
  const user = await readServerUser();
  if (!user) redirect(loginHref(page === 1 ? '/admin/boards' : `/admin/boards?page=${page}`));
  if (user.role !== 'admin') redirect('/drive');
  return <BoardModerationScreen key={user.id} initialUser={user} page={page} />;
}
