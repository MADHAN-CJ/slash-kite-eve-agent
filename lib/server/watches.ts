import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import {
  type WatcherPausedBy,
  type WatcherRow,
  type WatcherStatus,
  watchers,
} from '@/agent/lib/db/mcp-schema';
import { HttpError } from './auth';

/**
 * The user's watchers, read and updated in the MCP's own `watchers` table
 * (plan D15). A watcher is CREATED only by the MCP's `create_watcher` tool —
 * the agent asks for it in chat — and checked by the MCP's sweeper. This app
 * lists them and moves `status` between the states the sweeper understands;
 * the statements are the ones the MCP's former web app ran.
 */

export type WatchStatus = WatcherStatus;
export type WatchAction = 'pause' | 'resume' | 'cancel';

export interface WatchAlert {
  at: string;
  value: string | null;
  detail: string | null;
}

export interface WatchSummary {
  id: string;
  symbol: string;
  label: string;
  market: string;
  status: WatchStatus;
  statusReason: string | null;
  pausedBy: WatcherPausedBy | null;
  checkEveryMinutes: number;
  lastCheckedAt: string | null;
  lastValue: string | null;
  lastDetail: string | null;
  lastError: string | null;
  alertCount: number;
  lastAlertAt: string | null;
  expiresAt: string;
  createdAt: string;
  recentAlerts: WatchAlert[];
}

const RECENT_ALERTS = 3;

export function summarize(row: WatcherRow, recentAlerts: WatchAlert[]): WatchSummary {
  return {
    id: row.id,
    symbol: row.symbol,
    label: row.label,
    market: row.market,
    status: row.status,
    statusReason: row.statusReason,
    pausedBy: row.pausedBy,
    checkEveryMinutes: Math.floor(row.checkEveryS / 60),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastValue: row.lastValue,
    lastDetail: row.lastDetail,
    lastError: row.lastError,
    alertCount: row.firedCount,
    lastAlertAt: row.lastFiredAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    recentAlerts,
  };
}

type WatchPatch = Pick<WatcherRow, 'status' | 'pausedBy'> &
  Partial<Pick<WatcherRow, 'statusReason' | 'errorCount' | 'lastError'>>;

/**
 * The column changes an action makes from a given status, or null when the
 * action is not allowed there (an expired or cancelled watcher is final; a
 * cancelled one cannot be restarted — the user asks the agent for a new one).
 */
export function transition(action: WatchAction, status: WatchStatus): WatchPatch | null {
  if (action === 'pause' && status === 'ARMED') {
    return { status: 'PAUSED', pausedBy: 'user', statusReason: null };
  }
  if (action === 'resume' && (status === 'PAUSED' || status === 'ERROR')) {
    return { status: 'ARMED', pausedBy: null, statusReason: null, errorCount: 0, lastError: null };
  }
  if (action === 'cancel' && (status === 'ARMED' || status === 'PAUSED' || status === 'ERROR')) {
    return { status: 'CANCELLED', pausedBy: null };
  }
  return null;
}

async function recentAlertsFor(ids: string[]): Promise<Map<string, WatchAlert[]>> {
  const byWatcher = new Map<string, WatchAlert[]>();
  if (ids.length === 0) return byWatcher;
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const res = await db().execute<{ watcher_id: string; fired_at: Date; value: string | null; detail: string | null }>(sql`
    SELECT watcher_id, fired_at, value, detail FROM (
      SELECT f.*, row_number() OVER (PARTITION BY watcher_id ORDER BY fired_at DESC) AS rn
      FROM watcher_fires f WHERE watcher_id IN (${idList})) t
    WHERE rn <= ${RECENT_ALERTS} ORDER BY fired_at DESC`);
  for (const f of res.rows) {
    const list = byWatcher.get(f.watcher_id) ?? [];
    list.push({ at: new Date(f.fired_at).toISOString(), value: f.value, detail: f.detail });
    byWatcher.set(f.watcher_id, list);
  }
  return byWatcher;
}

export async function listWatches(userId: string): Promise<WatchSummary[]> {
  const rows = await db().select().from(watchers).where(eq(watchers.userId, userId)).orderBy(desc(watchers.createdAt));
  const alerts = await recentAlertsFor(rows.map((r) => r.id));
  return rows.map((r) => summarize(r, alerts.get(r.id) ?? []));
}

export async function mutateWatch(userId: string, id: string, action: WatchAction): Promise<WatchSummary> {
  const owned = and(eq(watchers.id, id), eq(watchers.userId, userId));
  const [row] = await db().select({ status: watchers.status }).from(watchers).where(owned);
  if (!row) throw new HttpError(404, 'Watcher not found.');
  const patch = transition(action, row.status);
  if (!patch) throw new HttpError(409, `Cannot ${action} a ${row.status.toLowerCase()} watcher.`);
  // Guarded on the status just read, so a concurrent sweeper or second tab cannot be overwritten.
  const [updated] = await db()
    .update(watchers)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(owned, eq(watchers.status, row.status)))
    .returning();
  if (!updated) throw new HttpError(409, 'The watcher changed just now. Reload and try again.');
  const alerts = await recentAlertsFor([id]);
  return summarize(updated, alerts.get(id) ?? []);
}
