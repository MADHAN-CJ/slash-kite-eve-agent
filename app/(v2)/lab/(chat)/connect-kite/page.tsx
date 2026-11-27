import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { ConnectKiteLab } from './connect-kite-lab';
import '../../lab.css';

export const dynamic = 'force-dynamic';

export default async function ConnectKiteLabPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((f) => f.id === 'connect-kite');
  if (!flow) notFound();
  const wanted = (await searchParams).s ?? flow.default;
  const state = flow.states.find((s) => s.id === wanted);
  if (!state) notFound();
  return <ConnectKiteLab state={state.id} />;
}
