import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import { Providers } from '@/components/providers';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Cloud Drive', template: '%s · Cloud Drive' },
  description: 'Lưu trữ và quản lý tệp của bạn.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#f8fafc' };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = (await cookies()).get('cloud_drive_locale')?.value === 'en' ? 'en' : 'vi';

  return (
    <html lang={locale} className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body><Providers initialLocale={locale}>{children}</Providers></body>
    </html>
  );
}
