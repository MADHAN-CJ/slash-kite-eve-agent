import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { AccountLab } from './account-lab';
import '../../lab.css';

export const dynamic = 'force-dynamic';

export default async function AccountLabPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((f) => f.id === 'account');
  const state = (await searchParams).s ?? flow?.default;
  if (!flow?.states.some((s) => s.id === state)) notFound();
  return <AccountLab state={state!} />;
}
