import { notFound } from 'next/navigation';
import { assertLab, FLOWS } from '@/lib/v2/lab';
import { Placeholder } from '../_lab/placeholder';
import '../lab.css';

// Rendered per request so the production gate (V2_LAB) is read at runtime.
export const dynamic = 'force-dynamic';

/**
 * A flow that has no lab screen yet: `/lab/<flow>?s=<state>`, the same address
 * shape as the prototype. A built flow has its own folder beside this one.
 */
export default async function LabFlow({
  params,
  searchParams,
}: {
  params: Promise<{ flow: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  assertLab();
  const { flow: id } = await params;
  const flow = FLOWS.find((f) => f.id === id);
  if (!flow) notFound();
  const wanted = (await searchParams).s ?? flow.default;
  const state = flow.states.find((s) => s.id === wanted);
  if (!state) notFound();
  return <Placeholder flow={flow} state={state} />;
}
