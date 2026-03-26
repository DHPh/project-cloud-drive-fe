import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OutgoingSharesScreen } from '@/components/share/outgoing-shares-screen';
import { loginHref, outgoingSharesHref, readOutgoingShares, searchParamsReader, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Đã chia sẻ' };

export default async function OutgoingSharesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) redirect(loginHref(outgoingSharesHref(readOutgoingShares(searchParamsReader(await searchParams)))));
  return <OutgoingSharesScreen key={user.id} initialUser={user} />;
}
