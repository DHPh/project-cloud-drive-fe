import type { Metadata } from 'next';
import { ExploreBoardsScreen } from '@/components/boards/public-board-screens';
import { pageNumber, searchParamsReader, type SearchParams } from '@/lib/routes';

export const metadata: Metadata = { title: 'Khám phá' };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const page = pageNumber(searchParamsReader(await searchParams).get('page'));
  return <ExploreBoardsScreen page={page} />;
}
