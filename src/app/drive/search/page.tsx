import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DriveDiscoveryScreen } from '@/components/drive/drive-discovery-screen';
import { driveSearchHref, loginHref, readDriveSearch, searchParamsReader, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Tìm toàn Drive của tôi' };

export default async function DriveSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) redirect(loginHref(driveSearchHref(readDriveSearch(searchParamsReader(await searchParams)))));
  return <DriveDiscoveryScreen key={user.id} initialUser={user} mode="search" />;
}
