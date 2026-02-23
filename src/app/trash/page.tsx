import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TrashScreen } from '@/components/trash/trash-screen';
import { loginHref, pageNumber, trashHref, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Thùng rác' };

export default async function TrashPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) {
    const { page } = await searchParams;
    redirect(loginHref(trashHref(pageNumber(typeof page === 'string' ? page : null))));
  }
  return <TrashScreen key={user.id} initialUser={user} />;
}
