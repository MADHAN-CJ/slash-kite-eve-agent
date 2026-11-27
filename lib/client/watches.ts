import type { WatchAction, WatchSummary } from '@/lib/server/watches';
import { handle } from './broker';
import { authHeaders } from './settings';

export type { WatchAction, WatchSummary };

/** Client for the watcher routes. Watchers are created in chat; here they are listed and managed. */

export const listWatches = async (alerts?: number): Promise<WatchSummary[]> =>
  (await handle<{ watches: WatchSummary[] }>(await fetch(`/api/watches${alerts ? `?alerts=${alerts}` : ''}`, { headers: authHeaders(), cache: 'no-store' })))
    .watches;

export const mutateWatch = async (id: string, action: WatchAction): Promise<WatchSummary> =>
  (
    await handle<{ watch: WatchSummary }>(
      await fetch(`/api/watches/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      }),
    )
  ).watch;

/** Whether the sweeper may still act on the watcher (as opposed to expired / cancelled). */
export const isLive = (w: WatchSummary): boolean => w.status === 'ARMED' || w.status === 'PAUSED' || w.status === 'ERROR';

export function statusLabel(w: Pick<WatchSummary, 'status' | 'pausedBy'>): string {
  if (w.status === 'ARMED') return 'watching';
  if (w.status === 'PAUSED' && w.pausedBy === 'broker') return 'paused · Zerodha session';
  return w.status.toLowerCase();
}
