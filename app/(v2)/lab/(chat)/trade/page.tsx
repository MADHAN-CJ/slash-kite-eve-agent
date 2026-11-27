import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { TradeLab } from './trade-lab';
import '../../lab.css';

export const dynamic = 'force-dynamic';

export default async function TradeLabPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((f) => f.id === 'trade');
  const state = (await searchParams).s ?? flow?.default;
  if (!flow?.states.some((s) => s.id === state)) notFound();
  return <TradeLab state={state!} />;
}
