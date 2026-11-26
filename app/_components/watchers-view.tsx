'use client';

import { useCallback, useEffect, useState } from 'react';
import { SessionExpiredError } from '@/lib/client/broker';
import type { TradeForm } from '@/lib/client/kite-publisher';
import { isLive, listWatches, type WatchSummary } from '@/lib/client/watches';
import { WatchCard } from './watch-card';

const REFRESH_MS = 15_000;

/**
 * The Watchers pane: every check the analyst set up for this user, live ones
 * first. Watchers run on the /markets server during market hours and email
 * the user when their condition becomes true; they are created by asking in
 * chat, so this pane only lists and manages them.
 */
export function WatchersView({
  onTrade,
  onNewChat,
  onLogout,
}: {
  readonly onTrade: (form: TradeForm) => void;
  readonly onNewChat: () => void;
  readonly onLogout: () => void;
}) {
  const [watches, setWatches] = useState<WatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionExpired = useCallback(
    (e: unknown): boolean => {
      if (!(e instanceof SessionExpiredError)) return false;
      onLogout();
      return true;
    },
    [onLogout],
  );

  const refresh = useCallback(async () => {
    try {
      setWatches(await listWatches());
      setError(null);
    } catch (e) {
      if (!sessionExpired(e)) setError(e instanceof Error ? e.message : 'Could not load watchers.');
    }
  }, [sessionExpired]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const patch = (updated: WatchSummary) =>
    setWatches((prev) => prev?.map((w) => (w.id === updated.id ? updated : w)) ?? prev);
  const live = (watches ?? []).filter(isLive);
  const done = (watches ?? []).filter((w) => !isLive(w));
  const card = (w: WatchSummary) => (
    <WatchCard key={w.id} onChanged={patch} onSessionExpired={sessionExpired} onTrade={onTrade} watch={w} />
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="watchers-view">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-8">
        <div>
          <h1 className="text-2xl">Watchers</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Checks the analyst set up for you. They run during market hours and email you when a condition becomes
            true.
          </p>
        </div>
        {error ? (
          <p className="rounded-md bg-negative-surface px-3 py-2 text-negative text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {watches === null && !error ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
        {watches !== null && watches.length === 0 ? (
          <div className="rounded-xl bg-surface px-4 py-8 text-center text-muted-foreground text-sm" data-testid="watchers-empty">
            <p>No watchers yet. Ask in chat: “Alert me when NIFTY crosses 25,000.”</p>
            <button className="mt-2 text-foreground underline underline-offset-4" onClick={onNewChat} type="button">
              Start a chat
            </button>
          </div>
        ) : null}
        {live.map(card)}
        {done.length > 0 ? (
          <>
            <p className="pt-3 text-muted-foreground text-sm">Finished</p>
            <div className="flex flex-col gap-3 opacity-70" data-testid="watchers-finished">
              {done.map(card)}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
