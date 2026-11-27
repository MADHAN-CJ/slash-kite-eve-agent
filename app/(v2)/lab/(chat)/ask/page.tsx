import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { Placeholder } from '../../_lab/placeholder';
import { AskLab } from './ask-lab';
import '../../lab.css';

export const dynamic = 'force-dynamic';

const BUILT = new Set(['empty', 'draft', 'run', 'answer', 'stopped', 'timeout', 'kite-expired', 'no-market-data', 'low', 'out', 'long', 'full']);

export default async function AskLabPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((f) => f.id === 'ask');
  if (!flow) notFound();
  const wanted = (await searchParams).s ?? flow.default;
  const state = flow.states.find((s) => s.id === wanted);
  if (!state) notFound();
  if (!BUILT.has(state.id)) return <Placeholder flow={flow} state={state} />;
  return <AskLab state={state.id} />;
}
