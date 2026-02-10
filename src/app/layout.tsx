import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Cloud Drive', template: '%s · Cloud Drive' },
  description: 'Lưu trữ và quản lý tệp của bạn.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#f9fafb' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = (await cookies()).get('cloud_drive_locale')?.value === 'en' ? 'en' : 'vi';

  return (
    <html lang={locale}>
      <body><Providers initialLocale={locale}>{children}</Providers></body>
    </html>
  );
}
