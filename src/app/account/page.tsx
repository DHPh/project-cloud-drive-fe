import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountScreen } from '@/components/account/account-screen';
import { loginHref } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Tài khoản' };

export default async function AccountPage() {
  const user = await readServerUser();
  if (!user) redirect(loginHref('/account'));
  return <AccountScreen key={user.id} initialUser={user} />;
}
