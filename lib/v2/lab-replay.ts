import { buildAnswer, type AnswerModel, type ToolActivity } from './answer-model';

/**
 * Lab fixtures for the `ask` flow: the prototype's "Where’s support on
 * Reliance?" run (markets-hero demo.js / run.js), as the real wire format
 * this app uses — two `run_python` calls whose stdout ends with a
 * `@@source` line — replayed with the prototype's own timings:
 * plan lines every 380 ms, a step takes max(650, ms × 6), then the text
 * arrives 250 ms later at 22 ms a word.
 */

export const Q = 'Where’s support on Reliance?';
export const NO_DATA_Q = 'Show me the 5-minute candles for RELIANCE on 22 November 2026.';
export const NO_DATA_REPLY = 'I couldn’t find any RELIANCE candles for 22 November. That was a Sunday. Try a trading day or a wider date range.';

const PLAN_LINE_MS = 380;
const TEXT_START_MS = 250;
const WORD_MS = 22;
const stepMs = (ms: number) => (ms ? Math.max(650, ms * 6) : 450);

const UIB = (t: string, o: unknown) => `\n\n\`\`\`ui:${t}\n${JSON.stringify(o)}\n\`\`\`\n\n`;

export const ANSWER_TEXT =
  '**RELIANCE** is moving between two clear levels on the daily timeframe. Support has held three times, and resistance has turned price back twice this month.' +
  UIB('levels', { symbol: 'RELIANCE', tf: '1D', price: 2948, levels: [{ label: 'Resistance', price: 2984, kind: 'resistance' }, { label: 'Support', price: 2912, kind: 'support' }, { label: 'Support', price: 2861, kind: 'support' }] }) +
  '## How it reads\n\n- Price is closer to the upper level, so the range is fairly tight\n- The lower support has been tested more often than the upper level\n- A close outside this range would change the picture\n\n| Level | Price | Note |\n|---|---|---|\n| Resistance | 2,984 | Rejected twice this month |\n| Support | 2,912 | Held on three tests |\n| Support | 2,861 | Last swing low |\n' +
  UIB('followups', ['Watch a close below 2,912', 'Show the weekly levels', 'Compare with Nifty']);

const result = (ms: number, lines: string[], source: Record<string, unknown>) =>
  `exit_code=0 duration=${ms}ms\n--- stdout ---\n${lines.join('\n')}\n@@source ${JSON.stringify(source)}`;

export const RELIANCE_TOOLS: ToolActivity[] = [
  {
    callId: 'c1',
    toolName: 'kite__run_python',
    input: {
      code: '# Get the last 60 daily candles for RELIANCE\ncandles = z.daily_candles("NSE:RELIANCE", days=60)\n# the prices where price has turned before\nlevels = turning_points(candles)\nprint(levels)',
    },
    output: result(142, ['Last price: 2,948', 'Highest close, 60 days: 2,984', 'Lowest close, 60 days: 2,861'], {
      dataset: 'Price history',
      symbol: 'RELIANCE',
      interval: '1D',
      rows: 60,
      range: '02 Sep to 23 Nov',
      values: [['Last price', '2,948'], ['Highest close, 60 days', '2,984'], ['Lowest close, 60 days', '2,861']],
    }),
    state: 'ok',
    at: '14:32:05',
  },
  {
    callId: 'c2',
    toolName: 'kite__run_python',
    input: { code: '# Compare them with today’s price\nquote = z.quote(["NSE:RELIANCE"])\nprint(quote)' },
    output: result(88, ['Last price: 2,948', 'Day range: 2,931 to 2,957'], {
      dataset: 'Quote',
      symbol: 'RELIANCE',
      rows: 1,
      values: [['Last price', '2,948'], ['Day range', '2,931 to 2,957']],
    }),
    state: 'ok',
    at: '14:32:05',
  },
];

export const NO_DATA_TOOLS: ToolActivity[] = [
  {
    callId: 'n1',
    toolName: 'kite__run_python',
    input: { code: '# Read the 5-minute RELIANCE candles for 22 Nov 2026\ncandles = z.intraday_candles("NSE:RELIANCE", 5, "2026-11-22", "2026-11-22")\nprint(len(candles))' },
    output: result(61, ['0'], { dataset: 'Price history', symbol: 'RELIANCE', interval: '5m', rows: 0, range: '22 Nov', values: [['Candles found', '0']] }),
    state: 'ok',
    at: '14:33:10',
  },
];

/** The watcher question's run (run.js `watcherDemo`): write the rule, test it once, then the confirm card. */
export const WATCH_Q = 'Tell me when RELIANCE closes below 2,912 on the 15-min chart';
export const WATCH_TEXT = 'I wrote your rule as a short script and ran it once on today’s candles. It isn’t true right now.';
export const WATCH_SCRIPT = 'candles = markets.history("RELIANCE", interval="15m", n=2)\nlast = candles[-2]                  # the last closed candle\nmet = last.close < 2912\nprint(json.dumps({"met": met, "value": last.close}))';
export const WATCH_TOOLS: ToolActivity[] = [
  {
    callId: 'w1',
    toolName: 'kite__run_python',
    input: { code: `# Write your rule as a short script\n${WATCH_SCRIPT}` },
    output: result(96, ['Last closed candle: 2,948.40'], { dataset: 'Price history', symbol: 'RELIANCE', interval: '15m', rows: 2, range: 'today', values: [['Last closed candle', '2,948.40']] }),
    state: 'ok',
    at: '14:33:40',
  },
  {
    callId: 'w2',
    toolName: 'kite__run_python',
    input: { code: `# Test it once on today’s candles\n${WATCH_SCRIPT}` },
    output: result(41, ['{"met": false, "value": 2948.4}'], { dataset: 'Watcher dry run', symbol: 'RELIANCE', rows: 1, values: [['Now', '2,948 · 36 above your level · not met']] }),
    state: 'ok',
    at: '14:33:41',
  },
  {
    callId: 'w3',
    toolName: 'kite__create_watcher',
    input: { symbol: 'NSE:RELIANCE', label: 'a 15-min candle closes below 2,912', script: WATCH_SCRIPT.replace(/ +# the last closed candle/, ''), check_every_minutes: 15, expires_in_days: 30, market: 'NSE' },
    state: 'awaiting',
    approval: { requestId: 'lab-req', approveId: 'approve', rejectId: 'reject' },
  },
];

export interface ReplayFrame {
  model: AnswerModel;
  /** The whole run is over (idle again). */
  done: boolean;
}

export type ReplayKind = 'run' | 'answer' | 'stopped' | 'timeout' | 'kite-expired' | 'no-market-data' | 'watch';

const wordsOf = (text: string) => text.match(/\S+\s*/g) ?? [];

/**
 * Plays one run and calls `emit` with each frame. Returns a stop function.
 * `kind` picks where the prototype's state stops: `run` holds inside the
 * first step, `stopped` stops after 14 words, `timeout` never gets text,
 * `kite-expired` loses the session after one sentence.
 */
export function replay(kind: ReplayKind, emitFrame: (f: ReplayFrame) => void, opts: { fast?: boolean } = {}): () => void {
  const timers: number[] = [];
  // RUN.fast never builds the plan (`.t5` stays empty), so a fast replay drops the steps.
  const emit = opts.fast ? (f: ReplayFrame) => emitFrame({ ...f, model: { ...f.model, steps: [] } }) : emitFrame;
  // `fast` = the prototype's RUN.fast: every frame on the next tick, in order (the limit states replay this way).
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, opts.fast ? 0 : ms));
  const tools = kind === 'no-market-data' ? NO_DATA_TOOLS : kind === 'watch' ? WATCH_TOOLS : RELIANCE_TOOLS;
  const fullText = kind === 'no-market-data' ? NO_DATA_REPLY : kind === 'watch' ? WATCH_TEXT : ANSWER_TEXT;

  const snapshot = (called: number, running: boolean, text: string, extra: Partial<Parameters<typeof buildAnswer>[0]> = {}): AnswerModel => {
    const acts: ToolActivity[] = tools.slice(0, called).map((t, i) => (i === called - 1 && running && t.state !== 'awaiting' ? { ...t, output: undefined, state: 'running' } : t));
    const m = buildAnswer({ text, tools: acts, streaming: true, ...extra });
    // The prototype lists every step before any runs: show the rest as pending.
    for (const t of tools.slice(called)) {
      const planned = buildAnswer({ text: '', tools: [t.state === 'awaiting' ? t : { ...t, output: undefined, state: 'running' }], streaming: true }).steps[0];
      if (planned) m.steps.push({ ...planned, status: 'pending', ms: undefined });
    }
    if (!extra.stopped && !extra.error && m.steps.some((s) => s.status === 'pending') && !m.steps.some((s) => s.status === 'running')) m.status = 'planning';
    return m;
  };

  let t = 0;
  emit({ model: snapshot(0, false, ''), done: false });
  // plan lines appear one by one
  for (let i = 1; i <= tools.length; i++) {
    t += PLAN_LINE_MS;
    later(t, () => emit({ model: snapshot(0, false, ''), done: false }));
  }
  // steps run
  for (let i = 0; i < tools.length; i++) {
    const idx = i;
    later(t, () => emit({ model: snapshot(idx + 1, true, ''), done: false }));
    if (kind === 'run' && idx === 0) return () => timers.forEach(clearTimeout);
    const raw = String(tools[idx].output ?? '');
    const ms = Number(/duration=(\d+)ms/.exec(raw)?.[1] ?? 0);
    t += stepMs(ms);
  }
  later(t, () => emit({ model: snapshot(tools.length, false, ''), done: false }));

  if (kind === 'timeout') {
    later(t + TEXT_START_MS, () => emit({ model: buildAnswer({ text: '', tools, streaming: false, error: 'Answer timed out' }), done: true }));
    return () => timers.forEach(clearTimeout);
  }

  const words = wordsOf(kind === 'kite-expired' ? 'I pulled the last 60 daily candles for **RELIANCE**.' : fullText);
  const stopAt = kind === 'stopped' ? 14 : words.length;
  t += TEXT_START_MS;
  let text = '';
  for (let w = 0; w < stopAt; w++) {
    text += words[w];
    const partial = text;
    t += WORD_MS;
    later(t, () => emit({ model: snapshot(tools.length, false, partial), done: false }));
  }
  const finalText = text;
  if (kind === 'stopped') {
    later(t + 1, () => emit({ model: buildAnswer({ text: finalText, tools, streaming: false, stopped: true }), done: true }));
  } else if (kind === 'kite-expired') {
    later(t + 650, () => {
      const expired: ToolActivity = { callId: 'c3', toolName: 'kite__run_python', input: { code: '# Check today’s candle\nprint(z.quote(["NSE:RELIANCE"]))' }, error: 'TokenExpired: the Zerodha session has ended. Log in to Zerodha again in the /markets app.', state: 'error', at: '14:32:08' };
      emit({ model: buildAnswer({ text: finalText, tools: [...tools, expired], streaming: false, stopped: true }), done: true });
    });
  } else {
    later(t + 1, () => emit({ model: buildAnswer({ text: finalText, tools, streaming: false }), done: true }));
  }
  return () => timers.forEach(clearTimeout);
}
