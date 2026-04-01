import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BoardListScreen } from '@/components/boards/board-owner-screen';
import { loginHref, pageNumber, searchParamsReader, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Bảng của tôi' };

export default async function BoardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const page = pageNumber(searchParamsReader(await searchParams).get('page'));
  const user = await readServerUser();
  if (!user) redirect(loginHref(page > 1 ? '/boards?page=' + page : '/boards'));
  return <BoardListScreen key={user.id} initialUser={user} page={page} />;
}
