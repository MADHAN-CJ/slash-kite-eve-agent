import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { HomeLab } from '@/components/v2/home/home-lab';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  assertLab();
  const flow = FLOWS.find((item) => item.id === 'signup');
  const state = (await searchParams).s ?? flow?.default;
  if (!state || !flow?.states.some((item) => item.id === state)) notFound();
  return <HomeLab flow="signup" state={state} />;
}
