import { describe, expect, it } from 'vitest';
import { fmtCountdown, initialKite, type KiteState, kiteReducer, LOGIN_TIMEOUT_S, nextSixAm, untilSix } from '@/lib/v2/kite-login';

const run = (events: Parameters<typeof kiteReducer>[1][], from: KiteState = initialKite) => events.reduce(kiteReducer, from);

describe('the Connect Kite state machine', () => {
  it('walks connect → wait → done', () => {
    const s = run([{ type: 'open' }, { type: 'start', opened: true }, { type: 'tick', secondsLeft: 280 }, { type: 'connected' }]);
    expect(s.mode).toBe('done');
  });

  it('a refused window is blocked; a closed window is a failure; five minutes is a timeout', () => {
    expect(run([{ type: 'start', opened: false }]).mode).toBe('blocked');
    expect(run([{ type: 'start', opened: true }, { type: 'window-closed' }]).mode).toBe('fail');
    expect(run([{ type: 'start', opened: true }, { type: 'tick', secondsLeft: 0 }]).mode).toBe('timeout');
    expect(run([{ type: 'start', opened: true }, { type: 'error', reason: 'cancelled' }])).toMatchObject({ mode: 'fail', reason: 'cancelled' });
  });

  it('only a waiting login can fail; closed/cancelled attempts go back to Connect', () => {
    expect(run([{ type: 'window-closed' }]).mode).toBe('connect');
    expect(run([{ type: 'start', opened: true }, { type: 'cancel' }])).toEqual({ mode: 'connect', secondsLeft: LOGIN_TIMEOUT_S });
    expect(run([{ type: 'start', opened: true }, { type: 'window-closed' }, { type: 'open' }]).mode).toBe('connect');
    expect(run([{ type: 'connected' }, { type: 'open' }]).mode).toBe('done');
  });

  it('FAQ is a page inside the dialog', () => {
    expect(run([{ type: 'faq' }]).mode).toBe('faq');
    expect(run([{ type: 'faq' }, { type: 'back' }]).mode).toBe('connect');
    expect(run([{ type: 'faq' }, { type: 'start', opened: true }]).mode).toBe('wait');
  });

  it('formats the countdown and the time left in the session', () => {
    expect(fmtCountdown(300)).toBe('5:00');
    expect(fmtCountdown(61)).toBe('1:01');
    const now = new Date(2026, 10, 25, 15, 28);
    expect(nextSixAm(now).getHours()).toBe(6);
    expect(untilSix(null, now).txt).toBe('14h 32m');
    expect(untilSix(new Date(now.getTime() + 2 * 36e5 + 5 * 6e4), now)).toEqual({ frac: (2 * 36e5 + 5 * 6e4) / (24 * 36e5), txt: '2h 05m' });
  });
});
