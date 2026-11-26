'use client';

import { useState } from 'react';
import { ArrowRightLeftIcon, RadarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type TradeForm, tradeFormFor, tradePath } from '@/lib/client/kite-publisher';
import { isLive, mutateWatch, statusLabel, type WatchAction, type WatchSummary } from '@/lib/client/watches';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<WatchSummary['status'], string> = {
  ARMED: 'bg-positive-surface text-positive',
  PAUSED: 'bg-select text-warning',
  ERROR: 'bg-negative-surface text-negative',
  EXPIRED: 'bg-surface text-muted-foreground',
  CANCELLED: 'bg-surface text-muted-foreground',
};

const timeAgo = (iso: string | null): string | null => {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/** One watcher: what it checks, how it is doing, and pause / resume / cancel / trade. */
export function WatchCard({
  watch,
  onChanged,
  onTrade,
  onSessionExpired,
}: {
  readonly watch: WatchSummary;
  readonly onChanged: (updated: WatchSummary) => void;
  readonly onTrade: (form: TradeForm) => void;
  readonly onSessionExpired: (e: unknown) => boolean;
}) {
  const [busy, setBusy] = useState<WatchAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const act = async (action: WatchAction) => {
    setBusy(action);
    setError(null);
    try {
      onChanged(await mutateWatch(watch.id, action));
    } catch (e) {
      if (!onSessionExpired(e)) setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const checked = timeAgo(watch.lastCheckedAt);
  const alerted = timeAgo(watch.lastAlertAt);
  const reason = watch.status === 'ERROR' || watch.pausedBy === 'broker' ? watch.statusReason : null;
  const trade = tradeFormFor(watch.symbol, watch.market);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4" data-testid="watch-card" data-watch-id={watch.id}>
      <div className="flex items-center gap-2">
        <RadarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {watch.symbol}{' '}
          <span className="font-normal text-muted-foreground text-sm">
            · {watch.market} · every {watch.checkEveryMinutes} min
          </span>
        </span>
        <span
          className={cn('rounded-full px-2.5 py-0.5 font-medium text-xs', STATUS_STYLE[watch.status])}
          data-testid="watch-status"
        >
          {statusLabel(watch)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{watch.label}</p>
      {reason ? <p className="text-negative text-sm">{reason}</p> : null}
      <p className="font-mono text-muted-foreground text-xs">
        {checked ? `checked ${checked}` : 'not checked yet'}
        {watch.lastValue !== null ? ` · value ${watch.lastValue}` : ''}
        {watch.lastDetail ? ` · ${watch.lastDetail}` : ''}
        {alerted ? ` · alerted ${watch.alertCount}× (last ${alerted})` : ''}
        {` · expires ${new Date(watch.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}`}
      </p>
      {watch.recentAlerts.length > 0 ? (
        <ul className="text-muted-foreground text-sm">
          {watch.recentAlerts.map((a) => (
            <li key={a.at}>
              ⚡ {when(a.at)}
              {a.value !== null ? ` · ${a.value}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="text-negative text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button asChild size="sm" variant="outline">
          <a
            data-testid="watch-trade"
            href={tradePath(trade)}
            onClick={(e) => {
              e.preventDefault();
              onTrade(trade);
            }}
          >
            <ArrowRightLeftIcon /> Trade on Kite
          </a>
        </Button>
        {isLive(watch) ? (
          <>
            {watch.status === 'ARMED' ? (
              <Button disabled={busy !== null} onClick={() => void act('pause')} size="sm" variant="secondary">
                {busy === 'pause' ? 'Pausing…' : 'Pause'}
              </Button>
            ) : (
              <Button disabled={busy !== null} onClick={() => void act('resume')} size="sm" variant="secondary">
                {busy === 'resume' ? 'Resuming…' : 'Resume'}
              </Button>
            )}
            <Button
              className="text-destructive hover:text-destructive"
              disabled={busy !== null}
              onClick={() => setConfirmCancelOpen(true)}
              size="sm"
              variant="ghost"
            >
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </Button>
          </>
        ) : null}
      </div>

      <Dialog onOpenChange={setConfirmCancelOpen} open={confirmCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this watcher</DialogTitle>
            <DialogDescription>
              Stop watching {watch.symbol} ({watch.label})? A cancelled watcher cannot be restarted; ask in chat for
              a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmCancelOpen(false)} type="button" variant="ghost">
              Keep watching
            </Button>
            <Button
              onClick={() => {
                setConfirmCancelOpen(false);
                void act('cancel');
              }}
              type="button"
              variant="destructive"
            >
              Cancel watcher
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
