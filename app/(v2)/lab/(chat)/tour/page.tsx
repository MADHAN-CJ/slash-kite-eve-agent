import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { TourLab } from './tour-lab';
import '@/styles/v2/tour.css';

export const dynamic = 'force-dynamic';

export default async function TourLabPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((f) => f.id === 'tour');
  if (!flow) notFound();
  const { s = flow.default } = await searchParams;
  if (s !== 'new' && s !== 'q' && s !== 'after' && s !== 'queued') notFound();
  return <TourLab state={s} />;
}
