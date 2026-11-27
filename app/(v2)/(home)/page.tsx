import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { HomeLab } from '@/components/v2/home/home-lab';
import { prefillFromParams } from '@/lib/client/kite-publisher';
import '@/styles/v2/home.css';
import '@/styles/v2/sheet.css';

export const metadata: Metadata = { title: '/markets · Search the market like the web' };

export default async function Homepage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  // Trade deep links and the Kite callback's full-page fallback land in the v2 chat (the v1 workspace is gone, V12).
  if (prefillFromParams(query) || query.has('kite')) redirect(`/chat?${query}`);
  return <HomeLab flow="homepage" state="open" live />;
}
