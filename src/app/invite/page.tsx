import type { Metadata } from 'next';
import { AccountLinkScreen } from '@/components/account/account-link-screen';

export const metadata: Metadata = { title: 'Kích hoạt tài khoản' };

export default function InvitePage() {
  return <AccountLinkScreen kind="invite" />;
}
