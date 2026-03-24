import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DriveDiscoveryScreen } from '@/components/drive/drive-discovery-screen';
import { loginHref, readTimeline, searchParamsReader, timelineHref, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Dòng thời gian' };

export default async function DriveTimelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) redirect(loginHref(timelineHref(readTimeline(searchParamsReader(await searchParams)))));
  return <DriveDiscoveryScreen key={user.id} initialUser={user} mode="timeline" />;
}
