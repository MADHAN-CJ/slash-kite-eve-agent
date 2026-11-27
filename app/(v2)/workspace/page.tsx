import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The v1 workspace is gone (plan-v2 V12); old trade / Kite links land in the v2 chat. */
export default async function WorkspaceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const qs = query.toString();
  redirect(qs ? `/chat?${qs}` : '/chat');
}
