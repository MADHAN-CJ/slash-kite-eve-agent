import type { WatchSummary } from '@/lib/server/watches';

/**
 * Lab fixtures for the `watchers` flow: the prototype's made-up watchers
 * (markets-hero ux/flows/watchers/flow.js `BASE`), as the API summary this
 * app reads, "as of" 25 Nov 2026 14:32 IST.
 */

export const LAB_NOW = new Date('2026-11-25T14:32:00+05:30');
const at = (s: string) => new Date(`${s}+05:30`).toISOString();

const SCRIPTS: Record<string, string> = {
  w1: 'candles = markets.history("RELIANCE", interval="15m", n=2)\nlast = candles[-2]                  # the last closed candle\nmet = last.close < 2912\nprint(json.dumps({"met": met, "value": last.close}))',
  w2: 'q = markets.quote("GOLDBEES")\nmet = q.ltp < 100\nprint(json.dumps({"met": met, "value": q.ltp}))',
  w3: 'candles = markets.history("CRUDEOIL", exchange="MCX", interval="1h", n=2)\nmet = candles[-2].close > 6480\nprint(json.dumps({"met": met, "value": candles[-2].close}))',
  w4: 'candles = markets.history("NIFTY-FUT", interval="15m", n=30)\nr = rsi(candles.close, 14)[-2]\nprint(json.dumps({"met": r > 70, "value": round(r, 1)}))',
  w5: 'chain = option_chain("BANKNIFTY", expiry="nearest")\npcr = chain.put_oi.sum() / chain.call_oi.sum()\nprint(json.dumps({"met": pcr < 0.7, "value": round(pcr, 2)}))',
  w6: 'candles = markets.history("TCS", interval="1d", n=2)\nmet = candles[-1].close > 4210\nprint(json.dumps({"met": met, "value": candles[-1].close}))',
  w7: 'candles = markets.history("TMPV", interval="15m", n=2)\nmet = candles[-2].close < 260\nprint(json.dumps({"met": met, "value": candles[-2].close}))',
  w8: 'q = markets.quote("HDFCBANK")\nprint(json.dumps({"met": q.ltp > 1800, "value": q.ltp}))',
};

const OLD = at('2026-11-20T10:00:00');

function w(id: string, o: Partial<WatchSummary> & Pick<WatchSummary, 'symbol' | 'label' | 'market' | 'status' | 'checkEveryMinutes' | 'expiresAt'>): WatchSummary {
  const alerts = o.recentAlerts ?? [];
  return {
    id,
    statusReason: null,
    pausedBy: null,
    lastCheckedAt: null,
    lastValue: null,
    lastDetail: null,
    lastError: null,
    alertCount: alerts.length,
    lastAlertAt: alerts[0]?.at ?? null,
    createdAt: OLD,
    recentAlerts: alerts,
    lastMet: false,
    script: SCRIPTS[id] ?? '',
    threadId: null,
    threadTitle: null,
    updatedAt: OLD,
    ...o,
  };
}

const fire = (s: string, value: string, detail: string) => ({ at: at(s), value, detail, emailed: true });

export function labWatchers(state: string): WatchSummary[] {
  if (state === 'empty') return [];
  const kite = state === 'kite' || state === 'remind';
  const today = kite ? '2026-11-24' : '2026-11-25';
  const list = [
    w('w1', {
      symbol: 'NSE:RELIANCE',
      label: '15-min candle closes below 2,912',
      market: 'NSE',
      status: 'ARMED',
      checkEveryMinutes: 15,
      lastCheckedAt: at('2026-11-25T14:30:00'),
      lastValue: '2948.40',
      expiresAt: at('2026-12-25T15:30:00'),
      threadTitle: 'Where’s support on Reliance?',
      createdAt: state === 'new' ? at('2026-11-25T14:31:00') : OLD,
    }),
    w('w2', {
      symbol: 'NSE:GOLDBEES',
      label: 'Price drops below 100',
      market: 'NSE',
      status: 'ARMED',
      lastMet: true,
      checkEveryMinutes: 1,
      lastCheckedAt: at('2026-11-25T14:32:00'),
      lastValue: '99.82',
      expiresAt: at('2026-12-19T15:30:00'),
      threadTitle: 'GOLDBEES levels this week',
      recentAlerts: [fire(`${today}T14:05:00`, '99.94', 'Dropped below 100.00'), fire('2026-11-19T10:32:00', '99.88', 'Dropped below 100.00')],
    }),
    w('w3', {
      symbol: 'MCX:CRUDEOIL',
      label: '1-hour candle closes above 6,480',
      market: 'MCX',
      status: 'ARMED',
      checkEveryMinutes: 60,
      lastCheckedAt: at('2026-11-25T14:00:00'),
      lastValue: '6412',
      expiresAt: at('2026-12-02T15:30:00'),
      threadTitle: 'Crude oil range this week',
      recentAlerts: [fire('2026-11-18T21:00:00', '6,492', 'Closed above 6,480 on the 1-hour chart')],
    }),
    w('w4', {
      symbol: 'NSE:NIFTY FUT',
      label: 'RSI(14) on 15 min goes above 70',
      market: 'NSE',
      status: 'ARMED',
      checkEveryMinutes: 15,
      lastCheckedAt: at('2026-11-25T14:30:00'),
      lastValue: '61.2',
      expiresAt: at('2026-12-09T15:30:00'),
      threadTitle: 'Bank Nifty RSI on 15 min',
      recentAlerts: [fire('2026-11-21T11:45:00', '70.4', 'RSI went above 70 on 15 min')],
    }),
    w('w5', {
      symbol: 'NSE:BANKNIFTY',
      label: 'Put-call ratio falls under 0.70',
      market: 'NSE',
      status: 'PAUSED',
      pausedBy: 'user',
      checkEveryMinutes: 5,
      lastCheckedAt: at('2026-11-24T15:30:00'),
      lastValue: '0.84',
      expiresAt: at('2026-12-05T15:30:00'),
      threadTitle: 'Bank Nifty OI walls',
    }),
    w('w6', {
      symbol: 'NSE:TCS',
      label: 'Daily close above 4,210',
      market: 'NSE',
      status: 'ERROR',
      statusReason: 'Stopped: no candles for TCS on 22 Nov. Last good check 21 Nov 15:30.',
      checkEveryMinutes: 1440,
      lastCheckedAt: at('2026-11-21T15:30:00'),
      expiresAt: at('2026-12-20T15:30:00'),
      threadTitle: 'TCS breakout?',
    }),
    w('w7', {
      symbol: 'NSE:TMPV',
      label: '15-min candle closes below 260',
      market: 'NSE',
      status: 'EXPIRED',
      checkEveryMinutes: 15,
      lastValue: '259.25',
      expiresAt: at('2026-11-24T15:30:00'),
      threadTitle: 'Tata Motors after the demerger',
      recentAlerts: [fire('2026-11-17T15:14:00', '259.25', 'Closed below 260.00')],
    }),
    w('w8', {
      symbol: 'NSE:HDFCBANK',
      label: 'Price goes above 1,800',
      market: 'NSE',
      status: 'CANCELLED',
      checkEveryMinutes: 1,
      lastValue: '1762',
      expiresAt: at('2026-12-15T15:30:00'),
      updatedAt: at('2026-11-20T11:00:00'),
      threadTitle: 'HDFC Bank results week',
    }),
  ];
  for (const x of list) x.threadId = x.threadTitle ? `lab-${x.id}` : null;
  if (kite) {
    for (const x of list) {
      if (x.status === 'ARMED' || x.id === 'w5') {
        x.status = 'PAUSED';
        x.pausedBy = 'broker';
        x.lastMet = false;
        x.lastCheckedAt = x.market === 'MCX' ? at('2026-11-24T23:00:00') : at('2026-11-24T15:30:00');
      }
    }
  }
  return list;
}

/* ---------- the two emails the flow previews (lab only; the real templates are phase V11) ---------- */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const KITE = '<svg class="kt" viewBox="0 0 22 16" aria-hidden="true"><path d="M0 8L11 0h11L11 8l11 8H11z" fill="#E8533F"/><path d="M11 8l11-8v16z" fill="#C93A26" opacity=".55"/></svg>';
const f = (n: number, d: number) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

function chart(): string {
  const V = [100.62, 100.51, 100.44, 100.38, 100.31, 100.22, 100.12, 100.04, 99.94, 99.9, 99.86, 99.82];
  const lv = 100;
  const all = V.concat(lv);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pd = (hi - lo) * 0.25 || 1;
  const Wd = 480;
  const H = 120;
  const y = (v: number) => 8 + ((hi + pd - v) / (hi + pd - (lo - pd))) * (H - 16);
  const x = (i: number) => 6 + (i * (Wd - 60)) / (V.length - 1);
  const hit = V.findIndex((v) => v < lv);
  return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="GOLDBEES over the last checks, with your level"><line x1="0" x2="${Wd}" y1="${y(lv)}" y2="${y(lv)}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 4"/><text x="${Wd - 4}" y="${y(lv) - 6}" text-anchor="end" fill="rgba(255,255,255,.55)" font-size="11" font-family="monospace">your level ${f(lv, 2)}</text><polyline fill="none" stroke="#8CB8FF" stroke-width="2" points="${V.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>${hit >= 0 ? `<circle cx="${x(hit)}" cy="${y(V[hit])}" r="5" fill="#8CB8FF"/><text x="${x(hit)}" y="${y(V[hit]) + 20}" text-anchor="middle" fill="#fff" font-size="11" font-family="monospace">14:05 · ${f(V[hit], 2)}</text>` : ''}</svg>`;
}

export function alertEmailHtml(mail: string): string {
  return `<div class="mx9"><div class="mc9">The email, as it lands · made-up numbers</div><article class="ml9"><header><h1>GOLDBEES dropped below 100.00 · 99.94</h1><div class="fm9"><span class="av9">/</span><div>/markets watchers<small>to ${esc(mail)}</small></div><time>Today 14:05</time></div></header><div class="mb9"><div class="in9"><div class="lg9">/markets</div><div class="ey9">Your watcher is true</div><h2>GOLDBEES dropped below 100.00</h2><div class="bg9">99.94<small>at 14:05 · NSE</small></div><div class="cv9">${chart()}</div><dl><dt>Your rule</dt><dd>Price drops below 100</dd><dt>Checks</dt><dd>Every 1 min, 09:15–15:30</dd><dt>Ends</dt><dd>19 Dec</dd><dt>From the chat</dt><dd>GOLDBEES levels this week</dd></dl><div class="bt9"><button type="button" class="p9" data-a="chart">Open chart</button><button type="button" data-a="trade">${KITE}Trade on Kite</button></div><p>It emails again only after GOLDBEES goes back above 100.00 and crosses again. Pause or cancel it on the Watchers page.</p><div class="ft9">Facts from market data. Not investment advice. /markets reads data only and never places orders.<br><u>Watchers</u> · <u>Stop these emails</u></div></div></div></article></div>`;
}

export function remindEmailHtml(mail: string, paused: WatchSummary[]): string {
  const rows = paused
    .map((x) => `<div><i class="d8 paused"></i><b>${esc(x.symbol.split(':').pop() ?? x.symbol)}</b><span>${esc(x.label)}</span></div>`)
    .join('');
  return `<div class="mx9"><div class="mc9">The morning email, sent at 08:00 · made-up numbers</div><article class="ml9"><header><h1>Reconnect Kite to keep ${paused.length} watchers running</h1><div class="fm9"><span class="av9">/</span><div>/markets watchers<small>to ${esc(mail)}</small></div><time>Today 08:00</time></div></header><div class="mb9"><div class="in9"><div class="lg9">/markets</div><div class="ey9">Before the open</div><h2>Your watchers are paused</h2><p style="margin-top:10px">Kite ends every session at 6:00 AM. Reconnect before 9:15 and they pick up where they left off.</p><div class="wl9">${rows}</div><div class="bt9"><button type="button" class="p9" data-a="kite">Reconnect Kite</button></div><p>It takes one login on Zerodha’s page. We never see your password.</p><div class="ft9">You get this only on days you have watchers paused. /markets reads data only and never places orders.<br><u>Watchers</u> · <u>Stop these emails</u></div></div></div></article></div>`;
}
