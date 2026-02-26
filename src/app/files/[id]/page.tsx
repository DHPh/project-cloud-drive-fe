import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { FileDetailScreen } from '@/components/share/file-detail-screen';
import { fileHref, isFileId, loginHref } from '@/lib/routes';
import { readServerUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Thông tin tệp' };

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isFileId(id)) notFound();
  const user = await readServerUser();
  if (!user) redirect(loginHref(fileHref(id)));
  return <FileDetailScreen key={`${user.id}:${id}`} initialUser={user} fileId={id} />;
}
