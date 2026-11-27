import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { WatchersLab } from './watchers-lab';
import '../../lab.css';

export const dynamic = 'force-dynamic';

export default async function WatchersLabPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((f) => f.id === 'watchers');
  if (!flow) notFound();
  const wanted = (await searchParams).s ?? flow.default;
  const state = flow.states.find((s) => s.id === wanted);
  if (!state) notFound();
  return <WatchersLab state={state.id} />;
}
