import type { AccountKite, AccountUsage } from '@/components/v2/chat/account-panel';

/** Exact, invented values from markets-hero account/flow.js. Lab only. */
export function labAccount(state: string): { kite: AccountKite; usage: AccountUsage } {
  const low = state === 'low';
  const out = state === 'out';
  return {
    kite: {
      kind: ['morning', 'expired', 'wait', 'reconnect-failed'].includes(state) ? 'off' : out ? 'out' : 'on',
      waiting: state === 'wait',
      failed: state === 'reconnect-failed',
      expired: state === 'expired',
      hours: 14,
      minutes: 32,
      fraction: 0.605,
      description: out
        ? 'You disconnected at 11:42. Chat and your 5 watchers are paused.'
        : state === 'expired'
          ? 'Reconnect to keep asking questions.'
          : 'Market opens in 1h 35m',
      waitingNote: out ? 'Read-only. We never place orders.' : 'Your 5 watchers are waiting',
      disconnectNote: 'Disconnect now? Chat and your 5 watchers stop until you reconnect.',
    },
    usage: {
      usedPct: low ? 92 : 36,
      resetLabel: '1 Dec',
      chatsPct: low ? 72 : 27,
      watchersPct: low ? 20 : 9,
      low,
      lowNote: low
        ? '8% left. Short questions still work. Long runs and new watchers may stop until 1 Dec.'
        : undefined,
    },
  };
}
