import { renderEmail, type EmailData, type MessageKind } from './render';

export function appLink(params: Record<string, string> = {}): string {
  const origin = process.env.APP_BASE_URL ?? '';
  const url = new URL('/chat', origin);
  if (url.protocol !== 'https:') throw new Error('Notification APP_BASE_URL must be HTTPS');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
export const stamp = (value: string | Date) => new Date(value).toLocaleString('en-GB', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}) + ' IST';

export interface WatchEmailData {
  id: string; symbol: string; label: string; market: string; check_every_s: number;
  expires_at: string; created_at: string; last_value: string | null; last_error: string | null;
  last_checked_at: string | null; fired_count: number; thread_id?: string; title?: string;
}
export function notificationContent(kind: MessageKind, email: string, payload: EmailData,
  watch?: WatchEmailData, paused: WatchEmailData[] = []) {
  const link: Record<string, string> = {
    settings: appLink({ emailSettings: '1' }), watchers: appLink({ view: 'watchers' }),
    connect: appLink({ connect: '1' }), safe: appLink({ connect: 'faq' }), kite: appLink({ connect: '1' }),
  };
  let data: EmailData = { email, link };
  if (kind === 'kite-nudge') {
    const last = payload.day === 3;
    data = { ...data, subject: last ? 'Last note about connecting Kite' : 'Connect Kite to start asking',
      preheader: last ? 'After this we stop asking. Connect any time from the sidebar.' : 'Read your account and the markets with /markets.',
      eyebrow: last ? 'Last reminder' : 'Waiting for Kite', head: last ? 'Three things you can ask once Kite is on' : 'Your account is ready for Kite',
      lead: last ? 'After this we stop asking. Connect any time from the sidebar.' : 'Connect Kite to ask about your account, prices and charts.',
      question: false, cap: last ? 'This is the last one.' : 'We send two of these at most.',
      can: last ? [{ q: 'Where is support on Reliance?', a: 'Levels and the code that found them.' },
        { q: 'Bank Nifty OI walls this expiry', a: 'Calls and puts, strike by strike.' },
        { q: 'Tell me when GOLDBEES drops below 100', a: 'A watcher that emails when your rule becomes true.' }] : false };
  } else if (kind === 'kite-reconnect') {
    const last = payload.last === true;
    data = { ...data, subject: `Reconnect Kite to keep ${paused.length} watcher${paused.length === 1 ? '' : 's'} running`,
      eyebrow: last ? 'Last reminder' : 'Before the open', head: `Your watcher${paused.length === 1 ? ' is' : 's are'} paused`,
      lead: `Reconnect Kite to resume checking.${last ? ' We’ll stop asking after today.' : ''}${paused.length > 5 ? ` And ${paused.length - 5} more watchers are paused.` : ''}`,
      after: 'The first check after reconnecting sets a new baseline. Paused watchers still end on their end date.',
      paused: paused.slice(0, 5).map(w => ({ sym: w.symbol, rule: w.label })) };
  } else {
    if (!watch) throw new Error('Watcher data required');
    const w = watch;
    link.chat = w.thread_id ? appLink({ thread: w.thread_id }) : appLink({ view: 'watchers' });
    link.fix = appLink({ fixWatcher: w.id });
    link.again = appLink({ view: 'watchers' });
    link.trade = appLink({ trade: '1', tradingsymbol: w.symbol, exchange: w.market, from: 'email', rule: w.label });
    data = { ...data, sym: w.symbol, rule: w.label };
    if (kind === 'watcher-alert') data = { ...data,
      said: 'watcher became true', value: payload.value ?? '—', at: stamp(String(payload.at)), ex: w.market,
      checks: `Every ${w.check_every_s / 60} minutes during ${w.market} market hours`, ends: stamp(w.expires_at),
      chat: w.title ?? 'Created through a connector', again: 'has a check where this rule is false',
      chart: 'cid:watcher-chart', chartAlt: `Recorded check values for ${w.symbol}; no synthetic data`,
    };
    if (kind === 'watcher-stopped') data = { ...data,
      short: /no data|no candles|empty/i.test(String(payload.error)) ? 'no data to check' : 'the script failed',
      why: 'The watcher stopped after repeated failed checks.', stopped: stamp(String(payload.at)),
      lastGood: payload.lastGood ? stamp(String(payload.lastGood)) : 'No successful check recorded',
      error: payload.error ?? 'Unknown check error', hint: 'Review the script and data before resuming.',
    };
    if (kind === 'watcher-ended') data = { ...data,
      subject: `Your ${w.symbol} watcher ended`, preheader: 'Review its checks or start another watcher.',
      lead: `This watcher reached its end date.${payload.pausedMostly ? ' It spent most of its recorded lifetime paused.' : ''}`,
      ran: `${stamp(w.created_at)} to ${stamp(w.expires_at)}`, sent: String(payload.sentCount ?? 0),
      lastLabel: 'Last value', last: w.last_value ?? 'Not recorded', note: 'Watch again opens your watchers. Start a new watcher to choose its duration.',
    };
  }
  return renderEmail(kind, data);
}
