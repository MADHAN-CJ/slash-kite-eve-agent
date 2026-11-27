import { describe, expect, it } from 'vitest';
import type { WatcherRow } from '@/agent/lib/db/mcp-schema';
import { isLive, statusLabel } from '@/lib/client/watches';
import { summarize, transition, type WatchAction, type WatchStatus } from '@/lib/server/watches';

const row = (over: Partial<WatcherRow> = {}): WatcherRow => ({
  id: 'w1',
  userId: '00000000-0000-0000-0000-000000000001',
  symbol: 'NSE:GOLDBEES',
  label: 'GOLDBEES above 70',
  script: 'print(1)',
  market: 'NSE',
  checkEveryS: 330,
  status: 'ARMED',
  statusReason: null,
  pausedBy: null,
  baselineDone: true,
  latched: false,
  lastMet: false,
  lastValue: '69.4',
  lastDetail: null,
  lastError: null,
  errorCount: 0,
  lastCheckedAt: new Date('2026-11-26T05:00:00Z'),
  lastFiredAt: null,
  firedCount: 0,
  expiresAt: new Date('2026-12-03T10:00:00Z'),
  createdAt: new Date('2026-11-26T04:00:00Z'),
  updatedAt: new Date('2026-11-26T05:00:00Z'),
  ...over,
});

describe('watcher summary', () => {
  it('maps the MCP row to what the UI shows (the script is the user\'s own; v2 shows it), never the owner id', () => {
    const alerts = [{ at: '2026-11-26T05:30:00.000Z', value: '70.1', detail: null }];
    const s = summarize(row({ firedCount: 2, lastFiredAt: new Date('2026-11-26T05:30:00Z') }), alerts);
    expect(s).toMatchObject({
      id: 'w1',
      symbol: 'NSE:GOLDBEES',
      status: 'ARMED',
      checkEveryMinutes: 5,
      lastCheckedAt: '2026-11-26T05:00:00.000Z',
      alertCount: 2,
      lastAlertAt: '2026-11-26T05:30:00.000Z',
      expiresAt: '2026-12-03T10:00:00.000Z',
      recentAlerts: alerts,
    });
    expect(s.script).toBe('print(1)');
    expect(s.lastMet).toBe(false);
    expect(s.threadId).toBeNull();
    expect(s).not.toHaveProperty('userId');
    expect(summarize(row(), [], { threadId: 't1', title: 'Chat' })).toMatchObject({ threadId: 't1', threadTitle: 'Chat' });
  });

  it('keeps never-checked and never-fired watchers null', () => {
    const s = summarize(row({ lastCheckedAt: null, lastValue: null }), []);
    expect(s.lastCheckedAt).toBeNull();
    expect(s.lastAlertAt).toBeNull();
    expect(s.lastValue).toBeNull();
  });
});

describe('watcher transitions', () => {
  const allowed: Record<WatchAction, WatchStatus[]> = {
    pause: ['ARMED'],
    resume: ['PAUSED', 'ERROR'],
    cancel: ['ARMED', 'PAUSED', 'ERROR'],
  };
  const statuses: WatchStatus[] = ['ARMED', 'PAUSED', 'ERROR', 'EXPIRED', 'CANCELLED'];

  it('allows exactly the moves the sweeper understands', () => {
    for (const action of Object.keys(allowed) as WatchAction[]) {
      for (const status of statuses) {
        expect(transition(action, status) !== null, `${action} from ${status}`).toBe(allowed[action].includes(status));
      }
    }
  });

  it('pause is a user pause; resume clears the error state; cancel is final', () => {
    expect(transition('pause', 'ARMED')).toEqual({ status: 'PAUSED', pausedBy: 'user', statusReason: null });
    expect(transition('resume', 'ERROR')).toEqual({
      status: 'ARMED',
      pausedBy: null,
      statusReason: null,
      errorCount: 0,
      lastError: null,
    });
    expect(transition('cancel', 'PAUSED')).toEqual({ status: 'CANCELLED', pausedBy: null });
    expect(transition('resume', 'CANCELLED')).toBeNull();
    expect(transition('resume', 'EXPIRED')).toBeNull();
  });
});

describe('watcher status in the UI', () => {
  it('labels and groups by status', () => {
    expect(statusLabel({ status: 'ARMED', pausedBy: null })).toBe('watching');
    expect(statusLabel({ status: 'PAUSED', pausedBy: 'user' })).toBe('paused');
    expect(statusLabel({ status: 'PAUSED', pausedBy: 'broker' })).toBe('paused · Zerodha session');
    expect(statusLabel({ status: 'ERROR', pausedBy: null })).toBe('error');
    const live = (status: WatchStatus) => isLive(summarize(row({ status }), []));
    expect(['ARMED', 'PAUSED', 'ERROR', 'EXPIRED', 'CANCELLED'].map((s) => live(s as WatchStatus))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});
