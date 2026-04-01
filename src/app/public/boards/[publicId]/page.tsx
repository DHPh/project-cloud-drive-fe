import type { Metadata } from 'next';
import { PublicBoardScreen } from '@/components/boards/public-board-screens';

export const metadata: Metadata = { title: 'Bảng công khai' };

export default async function PublicBoardPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <PublicBoardScreen publicId={publicId} />;
}
