import type { AccountKite, AccountUsage } from '@/components/v2/chat/account-panel';
import type { Usage } from '@/components/v2/chat/usage-api';
import type { BrokerStatus } from '@/lib/client/broker';

const MINUTE_MS = 60_000;
const IST = 'Asia/Kolkata';

export function accountKite(
  broker: BrokerStatus | null,
  paused: number,
  now: number,
  failed: boolean,
): AccountKite {
  const expiry = Date.parse(broker?.expiresAt ?? '');
  const expiresIn = Number.isFinite(expiry) ? Math.max(0, expiry - now) : 0;
  const minutes = Math.floor(expiresIn / MINUTE_MS);
  const disconnected = broker?.status === 'disconnected';
  const ended = broker?.status === 'token_expired';
  const expiredEarly = ended && (!Number.isFinite(expiry) || expiry > now);
  const disconnectedAt = broker?.disconnectedAt ? new Date(broker.disconnectedAt) : null;
  const when = disconnectedAt?.toLocaleString('en-GB', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const waitingNote =
    paused > 0
      ? `${paused} ${paused === 1 ? 'watcher is' : 'watchers are'} waiting for Kite.`
      : 'Read-only. We never place orders.';

  let kind: AccountKite['kind'] = 'loading';
  if (broker?.status === 'active') kind = 'on';
  else if (disconnected) kind = 'out';
  else if (ended) kind = 'off';
  else if (broker?.status === 'not_connected') kind = 'new';

  return {
    kind,
    expired: expiredEarly,
    failed,
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
    fraction: Math.min(1, expiresIn / (24 * 60 * MINUTE_MS)),
    description:
      disconnected && when
        ? `Disconnected ${when} IST. Connect Kite to ask again.`
        : 'Connect Kite to ask questions about your account and the markets.',
    waitingNote,
    disconnectNote: 'Disconnect Kite? Chat and active watchers pause until you reconnect.',
  };
}

export function accountUsage(usage: Usage | null): AccountUsage | null {
  if (!usage) return null;
  const reset = new Date(`${usage.resetsOn}T00:00:00Z`);
  const resetLabel = reset.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const usedPct = 100 - usage.leftPct;
  const low = usage.leftPct < 15;
  return {
    usedPct,
    chatsPct: usedPct,
    resetLabel,
    low,
    lowNote: low ? `${usage.leftPct}% of this month’s chat credits left.` : undefined,
  };
}
