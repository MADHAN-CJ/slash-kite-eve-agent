import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { deliveryDecision, nextWindow, tradingDay } from '@/lib/server/notifications/policy';
import { otpEmail } from '@/lib/server/notifications/otp';
import { watcherChart } from '@/lib/server/notifications/chart';
import { notificationContent, type WatchEmailData } from '@/lib/server/notifications/content';

const now = new Date('2026-11-27T10:00:00+05:30');
const base = { kind: 'kite-nudge', now, dueAt: now, expiresAt: new Date('2026-12-01'), watchers: true, growth: true, sentToday: 0, stale: false };
describe('notification delivery policy', () => {
  it('defers non-urgent mail outside 08:00–20:00 IST', () => {
    expect(nextWindow(new Date('2026-11-27T07:59:00+05:30')).toISOString()).toBe('2026-11-27T02:30:00.000Z');
    expect(nextWindow(new Date('2026-11-27T20:00:00+05:30')).toISOString()).toBe('2026-11-28T02:30:00.000Z');
    expect(deliveryDecision({ ...base, now: new Date('2026-11-27T21:00:00+05:30') })).toBe('wait');
  });
  it('caps non-urgent messages but sends alerts at any hour', () => {
    expect(deliveryDecision({ ...base, sentToday: 2 })).toBe('wait');
    expect(deliveryDecision({ ...base, kind: 'watcher-alert', now: new Date('2026-11-27T23:00:00+05:30'), sentToday: 10 })).toBe('send');
  });
  it('honors both preferences, staleness and expiry', () => {
    expect(deliveryDecision({ ...base, growth: false })).toBe('suppress');
    expect(deliveryDecision({ ...base, kind: 'watcher-alert', watchers: false })).toBe('suppress');
    expect(deliveryDecision({ ...base, stale: true })).toBe('suppress');
    expect(deliveryDecision({ ...base, expiresAt: now })).toBe('suppress');
  });
  it('uses weekday calendar plus configured exchange holidays', () => {
    expect(tradingDay(now, 'NSE')).toBe(true);
    expect(tradingDay(new Date('2026-11-28T10:00:00+05:30'), 'MCX')).toBe(false);
    expect(tradingDay(now, 'NSE', { NSE: ['2026-11-27'] })).toBe(false);
    expect(tradingDay(now, 'MCX', { NSE: ['2026-11-27'] })).toBe(true);
  });
});
it('renders real OTP metadata and both account variants', () => {
  for (const returning of [true, false]) {
    const mail = otpEmail({ email: 'user@example.com', code: '123456', returning, at: now, userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537' });
    expect(mail.subject).toBe('123456 is your /markets code');
    expect(mail.html).toContain(returning ? 'Sign-in code' : 'Sign-up code');
    expect(mail.text).toContain('10:00 IST · Chrome on Mac');
    expect(mail.html).not.toContain('417302');
  }
});
it('renders PNGs from recorded values, including missing or single-point history', async () => {
  for (const samples of [[], [{ at: now.toISOString(), value: '99.94' }], [{ at: now.toISOString(), value: 'not numeric' }]]) {
    const png = await watcherChart(samples, '<script>Test</script>');
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png'); expect(meta.width).toBe(534);
  }
});
it('renders each production message from real-shaped data with working app links', () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://app.example.com';
  const w: WatchEmailData = { id: 'w1', symbol: 'TCS', label: 'Value above 100', market: 'NSE', check_every_s: 60,
    expires_at: '2026-12-01', created_at: '2026-11-01', last_value: '101', last_error: 'No data',
    last_checked_at: now.toISOString(), fired_count: 1, thread_id: 'thread1', title: 'My question' };
  try {
    for (const kind of ['kite-nudge', 'kite-reconnect', 'watcher-alert', 'watcher-stopped', 'watcher-ended'] as const) {
      const mail = notificationContent(kind, 'user@example.com', { day: 3, at: now.toISOString(), error: 'No data', value: '101' }, w, [w]);
      expect(mail.html).not.toContain('{{'); expect(mail.text).not.toContain('{{');
      expect(mail.html).toContain('emailSettings=1');
      if (kind === 'watcher-alert') expect(mail.html).toContain('thread=thread1');
    }
  } finally { if (previous === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previous; }
});
