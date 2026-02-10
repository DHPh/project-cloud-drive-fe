import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginScreen } from '@/components/login-form';
import { safeDriveRedirect, type SearchParams } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const destination = safeDriveRedirect((await searchParams).redirect);
  if (await readServerUser()) redirect(destination);
  return <LoginScreen destination={destination} />;
}
