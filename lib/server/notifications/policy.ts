const OFFSET = 330 * 60_000;
export const DAY = 86_400_000;
export function istDay(at: Date): string { return new Date(at.getTime() + OFFSET).toISOString().slice(0, 10); }
export function istHour(at: Date): number { return new Date(at.getTime() + OFFSET).getUTCHours(); }
export function istAt(day: string, hour: number): Date { return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`); }
export function nextWindow(at: Date): Date {
  const hour = istHour(at);
  if (hour < 8) return istAt(istDay(at), 8);
  if (hour >= 20) return istAt(istDay(new Date(at.getTime() + DAY)), 8);
  return at;
}
/** Matches the MCP's current weekday calendar; configured exchange holidays are also excluded. */
export function tradingDay(at: Date, market: string, holidays: Record<string, string[]> = {}): boolean {
  const day = new Date(at.getTime() + OFFSET).getUTCDay();
  return day !== 0 && day !== 6 && !(holidays[market] ?? []).includes(istDay(at));
}
export function deliveryDecision(input: {
  kind: string; now: Date; dueAt: Date; expiresAt: Date;
  watchers: boolean; growth: boolean; sentToday: number; stale: boolean;
}): 'send' | 'wait' | 'suppress' {
  if (input.stale || input.now >= input.expiresAt) return 'suppress';
  if (input.kind === 'kite-nudge' ? !input.growth : !input.watchers) return 'suppress';
  if (input.now < input.dueAt) return 'wait';
  if (input.kind !== 'watcher-alert' && (nextWindow(input.now) > input.now || input.sentToday >= 2)) return 'wait';
  return 'send';
}
