import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminScreen } from '@/components/account/admin-screen';
import { adminHref, loginHref, readAdminFilters, searchParamsReader, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Quản trị' };

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await readServerUser();
  if (!user) redirect(loginHref(adminHref(readAdminFilters(searchParamsReader(await searchParams)))));
  if (user.role !== 'admin') redirect('/drive');
  return <AdminScreen key={user.id} initialUser={user} />;
}
