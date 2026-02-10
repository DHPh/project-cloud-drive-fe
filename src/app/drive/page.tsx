import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DriveScreen } from '@/components/drive/drive-screen';
import { incomingDriveHref, loginHref, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Drive' };

export default async function DrivePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) redirect(loginHref(incomingDriveHref(await searchParams)));
  return <DriveScreen key={user.id} initialUser={user} />;
}
