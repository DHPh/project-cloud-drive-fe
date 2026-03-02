import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SharedFilesScreen } from '@/components/share/shared-files-screen';
import { loginHref, pageNumber, sharedHref, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Được chia sẻ với tôi' };

export default async function SharedFilesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) {
    const { page, tab } = await searchParams;
    redirect(loginHref(sharedHref(pageNumber(typeof page === 'string' ? page : null), tab === 'folders' ? 'folders' : 'files')));
  }
  return <SharedFilesScreen key={user.id} initialUser={user} />;
}
