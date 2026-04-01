import type { Metadata } from 'next';
import { AccountLinkScreen } from '@/components/account/account-link-screen';

export const metadata: Metadata = { title: 'Đặt lại mật khẩu' };

export default function ResetPasswordPage() {
  return <AccountLinkScreen kind="reset" />;
}
