import { extractChartLine, stdoutOf, type ChartSpec } from '@/components/charts/chart-line';
import { resultText } from '@/components/charts/tool-result-chart';

/**
 * The answer as the v2 run shows it (markets-hero `ux/shared/chat/run.js`):
 * a plan that ticks off, numbered sources with a receipt, the code that ran,
 * an optional chart, then the text. Built from either the live eve message
 * parts or the persisted `MessagePart[]`, so history and the stream render
 * through the same component.
 *
 * What the prototype invented is read from real data here (plan D7):
 *  - one SOURCE per tool call the model made for the user (scripts, web
 *    searches, Zerodha calls); internal tools (skill, connection lookup) are
 *    plan steps but not sources;
 *  - a script's `dataset / symbol / interval / rows / range / values` come
 *    from a `@@source {json}` line it prints last (the skill asks for it),
 *    else from the code and its output;
 *  - timings: the MCP runner's `duration=NNNms` head, else the stream clock;
 *  - the receipt: rows summed over the sources, the tokens the tool results
 *    put in front of the model (≈ characters / 4), the latest "as of".
 */

export type SourceKind = 'python' | 'search' | 'zerodha' | 'watcher' | 'tool';
export type StepStatus = 'pending' | 'running' | 'ok' | 'error' | 'stopped';

export interface SourceMeta {
  dataset?: string;
  symbol?: string;
  interval?: string;
  rows?: number;
  range?: string;
  values?: [string, string][];
}

export interface RunSource {
  /** 1-based number shown in the mark and the list. */
  n: number;
  kind: SourceKind;
  toolName: string;
  callId: string;
  dataset: string;
  symbol: string;
  interval?: string;
  rows?: number;
  range?: string;
  /** HH:MM:SS when the result arrived (or the message time for history). */
  asOf: string;
  ms?: number;
  values: [string, string][];
  code?: string;
  /** What the tool returned, as text (the Output the user may expand). */
  output?: string;
  status: StepStatus;
  error?: string;
}

export interface RunStep {
  callId: string;
  label: string;
  /** The small mono line once the step is done, e.g. `python · RELIANCE 1D · 60 rows`. */
  detail: string;
  status: StepStatus;
  ms?: number;
  /** The source this step produced, when it is one. */
  source?: RunSource;
}

export type AnswerStatus = 'planning' | 'running' | 'writing' | 'done' | 'stopped' | 'error';

/** The watcher confirm card (markets-hero run.js `wCard`) for a create_watcher call. */
export interface WatcherCard {
  callId: string;
  state: 'pending' | 'live' | 'declined' | 'failed';
  symbol: string;
  label: string;
  script: string;
  everyMinutes: number;
  expiresDays: number;
  market: string;
  /** The value of the last dry run, when one is known. */
  now: string | null;
  error?: string;
  approval?: { requestId: string; approveId: string; rejectId: string };
}

export interface AnswerModel {
  status: AnswerStatus;
  watcher: WatcherCard | null;
  /** The text to show, with `@@chart` / `@@source` lines and `ui:` fences removed. */
  text: string;
  steps: RunStep[];
  sources: RunSource[];
  chart: ChartSpec | null;
  /** Sum of the sources' timings. */
  ms: number;
  /** Sum of the sources' row counts (only sources that reported rows). */
  rows: number;
  /** ≈ tokens the tool results sent to the model. */
  tokensSent: number;
  asOf: string;
  /** Every reported source found nothing (e.g. no candles for the date). */
  noData: boolean;
  /** A tool said the Zerodha session is over. */
  kiteExpired: boolean;
  error?: string;
}

/** The shape both the live parts and the persisted parts are reduced to first. */
export interface ToolActivity {
  callId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  state: 'running' | 'ok' | 'error' | 'denied' | 'awaiting';
  /** A call parked for the user's approval (create_watcher's confirm card). */
  approval?: { requestId: string; approveId: string; rejectId: string };
  /** HH:MM:SS, when known. */
  at?: string;
  /** Wall time between request and result, when the stream clock gave it. */
  elapsedMs?: number;
}

const INTERNAL_TOOLS = new Set(['load_skill', 'connection_search', 'ask_question', 'todo']);
const SOURCE_MARKER = '@@source ';
const CHARS_PER_TOKEN = 4;

/** `kite__run_python` → `run_python`. */
export const toolBase = (toolName: string): string => {
  const i = toolName.lastIndexOf('__');
  return i >= 0 ? toolName.slice(i + 2) : toolName;
};

export const isInternalTool = (toolName: string): boolean => INTERNAL_TOOLS.has(toolBase(toolName));

export function timeOf(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Kolkata' });
}

/** `exit_code=0 duration=142ms` → 142 (the head may follow an "Error executing tool" prefix). */
export function durationOf(text: string): number | undefined {
  const m = /exit_code=-?\d+ duration=(\d+)ms/.exec(text);
  return m ? Number(m[1]) : undefined;
}

/**
 * MCP tool failures can arrive as a successful part whose output is marked
 * `isError` (or whose text starts "Error executing tool …"): read those as
 * errors so the step, the source and the Kite check see them as such.
 */
export function normalizeActivity(a: ToolActivity): ToolActivity {
  if (a.state !== 'ok') return a;
  const o = a.output as { isError?: boolean } | undefined;
  const text = resultText(a.output) ?? '';
  if (o?.isError || /^Error executing tool/i.test(text)) return { ...a, state: 'error', error: text.replace(/^Error executing tool [^:]*:\s*/i, ''), output: undefined };
  return a;
}

/**
 * The trailing `@@source {…}` line of a script's stdout, and the stdout
 * without it. A `@@chart` line may sit on either side of it.
 */
export function extractSourceLine(stdout: string): { text: string; meta: SourceMeta | null } {
  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || line.startsWith('@@chart ')) continue;
    if (!line.startsWith(SOURCE_MARKER)) return { text: stdout, meta: null };
    const meta = parseSourceMeta(line.slice(SOURCE_MARKER.length));
    if (!meta) return { text: stdout, meta: null };
    return { text: [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').replace(/\n+$/, ''), meta };
  }
  return { text: stdout, meta: null };
}

function parseSourceMeta(json: string): SourceMeta | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const rows = typeof o.rows === 'number' && Number.isFinite(o.rows) ? Math.max(0, Math.round(o.rows)) : undefined;
  const values: [string, string][] = [];
  if (Array.isArray(o.values)) {
    for (const v of o.values) {
      if (Array.isArray(v) && v.length >= 2) values.push([String(v[0]), String(v[1])]);
      else if (v && typeof v === 'object') {
        const [k, val] = Object.entries(v as Record<string, unknown>)[0] ?? [];
        if (k !== undefined) values.push([String(k), String(val)]);
      }
    }
  }
  return { dataset: str(o.dataset), symbol: str(o.symbol), interval: str(o.interval), rows, range: str(o.range), values: values.slice(0, 8) };
}

/** The symbol a script is about: the first quote key or resolve_symbol argument in the code. */
export function symbolInCode(code: string): string {
  const key = /["']([A-Z]{2,4}:[A-Z0-9&\-]+(?: [A-Z0-9]+)?)["']/.exec(code);
  if (key) return key[1];
  const resolve = /resolve_symbol\(\s*["']([^"']+)["']/.exec(code);
  if (resolve) return resolve[1].toUpperCase();
  const name = /(?:underlying|symbol|name)\s*=\s*["']([A-Za-z0-9&\-]+)["']/.exec(code);
  return name ? name[1].toUpperCase() : '';
}

/** The first comment line of a script, in plain words (the skill asks for one). */
export function commentInCode(code: string): string {
  const m = /^\s*#\s*(.+)$/m.exec(code);
  return m ? m[1].trim().replace(/\.$/, '') : '';
}

const isTokenExpired = (text: string): boolean => /TokenExpired|session (has )?expired|not connected|reconnect/i.test(text);

function valuesFromOutput(stdout: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('@@')) continue;
    const m = /^([^:{}\[\]]{1,40}):\s+(.{1,60})$/.exec(t);
    if (m) out.push([m[1].trim(), m[2].trim()]);
    if (out.length >= 4) break;
  }
  return out;
}

function sourceFor(a: ToolActivity, n: number, fallbackAt: string): RunSource | null {
  const base = toolBase(a.toolName);
  const status: StepStatus = a.state === 'running' ? 'running' : a.state === 'ok' ? 'ok' : 'error';
  const asOf = a.at ?? fallbackAt;
  const common = { n, toolName: a.toolName, callId: a.callId, asOf, status, error: a.error };
  if (base === 'run_python') {
    const input = (a.input ?? {}) as { code?: string };
    const code = typeof input.code === 'string' ? input.code : '';
    const raw = a.output !== undefined ? (resultText(a.output) ?? '') : (a.error ?? '');
    const stdout = stdoutOf(raw);
    const { text: withoutSource, meta } = extractSourceLine(stdout);
    const { text: output } = extractChartLine(withoutSource);
    const ms = durationOf(raw) ?? a.elapsedMs;
    const symbol = meta?.symbol ?? symbolInCode(code);
    return {
      ...common,
      kind: 'python',
      dataset: meta?.dataset ?? (a.state === 'error' ? 'Script failed' : 'Script'),
      symbol,
      interval: meta?.interval,
      rows: meta?.rows,
      range: meta?.range,
      ms,
      values: meta?.values?.length ? meta.values : a.state === 'ok' ? valuesFromOutput(output) : [],
      code,
      output: output || undefined,
    };
  }
  if (base === 'web_search') {
    const input = (a.input ?? {}) as { query?: string };
    const results = ((a.output as { results?: unknown[] } | undefined)?.results ?? []).filter(
      (r): r is { title?: string; url?: string } => Boolean(r) && typeof r === 'object',
    );
    return {
      ...common,
      kind: 'search',
      dataset: 'Web search',
      symbol: typeof input.query === 'string' ? input.query : '',
      rows: a.state === 'ok' ? results.length : undefined,
      ms: a.elapsedMs,
      values: results.slice(0, 5).map((r) => [r.title ?? r.url ?? '', r.url ?? '']),
      output: a.error,
    };
  }
  if (base === 'auth_status' || base === 'profile') {
    const o = (a.output ?? {}) as Record<string, unknown>;
    const pick = (k: string, label: string): [string, string] | null => (o[k] !== undefined && o[k] !== null ? [label, String(o[k])] : null);
    return {
      ...common,
      kind: 'zerodha',
      dataset: base === 'profile' ? 'Your profile' : 'Zerodha connection',
      symbol: typeof o.kiteUserId === 'string' ? o.kiteUserId : '',
      ms: a.elapsedMs,
      values: [pick('broker', 'Status'), pick('email', 'Signed in as'), pick('sessionExpiresAt', 'Session ends')].filter((v): v is [string, string] => v !== null),
      output: a.error,
    };
  }
  if (base === 'create_watcher' || base === 'list_watchers') {
    const input = (a.input ?? {}) as { symbol?: string; label?: string; check_every_minutes?: number };
    return {
      ...common,
      kind: 'watcher',
      dataset: base === 'create_watcher' ? 'Watcher saved' : 'Your watchers',
      symbol: input.symbol ?? '',
      ms: a.elapsedMs,
      values: base === 'create_watcher'
        ? [input.label ? (['Rule', input.label] as [string, string]) : null, input.check_every_minutes ? (['Checks', `every ${input.check_every_minutes} min`] as [string, string]) : null].filter((v): v is [string, string] => v !== null)
        : [],
      output: a.error,
    };
  }
  return { ...common, kind: 'tool', dataset: base.replace(/_/g, ' '), symbol: '', ms: a.elapsedMs, values: [], output: a.error };
}

function stepFor(a: ToolActivity, source: RunSource | null): RunStep {
  const base = toolBase(a.toolName);
  const status: StepStatus = a.state === 'running' ? 'running' : a.state === 'ok' ? 'ok' : 'error';
  if (base === 'load_skill') return { callId: a.callId, label: 'Read the zapkite guide', detail: 'skill', status, ms: a.elapsedMs };
  if (base === 'connection_search') return { callId: a.callId, label: 'Look up the Kite tools', detail: 'tools', status, ms: a.elapsedMs };
  if (!source) return { callId: a.callId, label: base.replace(/_/g, ' '), detail: base, status, ms: a.elapsedMs };
  const ms = source.ms;
  if (source.kind === 'python') {
    const what = commentInCode(source.code ?? '');
    const label = what || (source.symbol ? `Run a script on ${source.symbol}` : 'Run a script next to the data');
    if (/dry run/i.test(source.dataset)) {
      // The watcher's test run (run.js: "watcher · dry run · not met").
      const result = source.values[0]?.[1] ?? '';
      const met = /not met/i.test(result) ? 'not met' : /\bmet\b/i.test(result) ? 'met' : '';
      return { callId: a.callId, label, detail: ['watcher', 'dry run', met].filter(Boolean).join(' · '), status, ms, source };
    }
    const unit = /history|candle/i.test(source.dataset) ? 'candles' : 'rows';
    const count = source.rows !== undefined ? `${source.rows} ${source.rows === 1 ? unit.replace(/s$/, '') : unit}` : '';
    const bits = ['python', [source.symbol, source.interval].filter(Boolean).join(' '), count].filter(Boolean);
    return { callId: a.callId, label, detail: bits.join(' · '), status, ms, source };
  }
  if (source.kind === 'search') {
    return { callId: a.callId, label: source.symbol ? `Search the web for “${source.symbol}”` : 'Search the web', detail: `search${source.rows !== undefined ? ` · ${source.rows} results` : ''}`, status, ms, source };
  }
  if (source.kind === 'zerodha') return { callId: a.callId, label: base === 'profile' ? 'Read your profile' : 'Check the Zerodha connection', detail: 'zerodha', status, ms, source };
  if (source.kind === 'watcher') {
    return { callId: a.callId, label: base === 'create_watcher' ? `Save the watcher${source.symbol ? ` on ${source.symbol}` : ''}` : 'List your watchers', detail: `watcher${source.symbol ? ` · ${source.symbol}` : ''}`, status, ms, source };
  }
  return { callId: a.callId, label: source.dataset, detail: source.kind, status, ms, source };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function watcherCard(a: ToolActivity, sources: RunSource[]): WatcherCard {
  const i = (a.input ?? {}) as { symbol?: unknown; label?: unknown; script?: unknown; check_every_minutes?: unknown; expires_in_days?: unknown; market?: unknown };
  const out = (a.output as { structuredContent?: unknown } | undefined)?.structuredContent ?? a.output;
  const created = (out ?? {}) as { created?: boolean; error?: string | null; watcher?: { market?: string; dryRun?: { value?: unknown } } };
  const dry = [...sources].reverse().find((s) => /dry run/i.test(s.dataset));
  const dryNow = created.watcher?.dryRun?.value ?? dry?.values[0]?.[1] ?? null;
  const state: WatcherCard['state'] =
    a.state === 'awaiting' || a.state === 'running' ? 'pending' : a.state === 'denied' ? 'declined' : a.state === 'error' || created.created === false ? 'failed' : 'live';
  return {
    callId: a.callId,
    state,
    symbol: typeof i.symbol === 'string' ? i.symbol : '',
    label: typeof i.label === 'string' ? i.label : '',
    script: typeof i.script === 'string' ? i.script : '',
    everyMinutes: num(i.check_every_minutes, 1),
    expiresDays: num(i.expires_in_days, 30),
    market: created.watcher?.market ?? (typeof i.market === 'string' && i.market !== 'auto' ? i.market : ''),
    now: dryNow === null || dryNow === undefined ? null : String(dryNow),
    error: state === 'failed' ? (a.error ?? created.error ?? 'The watcher was not created.') : undefined,
    approval: a.approval,
  };
}

/**
 * Markdown the model wrote, minus what the UI renders elsewhere: the `@@`
 * lines and the `ui:` blocks that are not components (sources come from the
 * tool calls; levels, stat and followups stay for the markdown renderer).
 */
export function cleanText(text: string): string {
  return text
    .replace(/```ui:(?!levels|stat|followups)\w*\n[\s\S]*?\n```/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('@@chart ') && !l.trim().startsWith('@@source '))
    .join('\n')
    .trim();
}

export function buildAnswer(input: {
  text: string;
  tools: ToolActivity[];
  /** Whether text is still arriving / tools still running. */
  streaming: boolean;
  stopped?: boolean;
  error?: string;
  /** Time of the message for history (HH:MM:SS); the stream uses the tool's own time. */
  at?: string;
}): AnswerModel {
  const fallbackAt = input.at ?? timeOf(undefined);
  const steps: RunStep[] = [];
  const sources: RunSource[] = [];
  let chart: ChartSpec | null = null;
  let tokensSent = 0;
  let kiteExpired = false;
  let watcher: WatcherCard | null = null;
  for (const raw of input.tools) {
    const a = normalizeActivity(raw);
    if (toolBase(a.toolName) === 'create_watcher') watcher = watcherCard(a, sources);
    if (a.state === 'denied') continue;
    if (a.state === 'awaiting') {
      // The card itself shows the watcher: the plan says what happens next, no source yet.
      steps.push({ callId: a.callId, label: 'Show you the watcher before it starts', detail: 'nothing runs until you say Start', status: 'ok' });
      continue;
    }
    const source = isInternalTool(a.toolName) ? null : sourceFor(a, sources.length + 1, fallbackAt);
    if (source) sources.push(source);
    steps.push(stepFor(a, source));
    const outText = a.output !== undefined ? (resultText(a.output) ?? JSON.stringify(a.output)) : (a.error ?? '');
    tokensSent += Math.round(outText.length / CHARS_PER_TOKEN);
    if (!chart && toolBase(a.toolName) === 'run_python' && a.output !== undefined) {
      chart = extractChartLine(extractSourceLine(stdoutOf(resultText(a.output) ?? '')).text).chart;
    }
    if (a.state === 'error' && isTokenExpired(a.error ?? '')) kiteExpired = true;
    if (a.state === 'ok' && toolBase(a.toolName) === 'auth_status') {
      const o = a.output as { broker?: unknown } | undefined;
      if (o && typeof o.broker === 'string' && /expired|not_connected|disconnected/i.test(o.broker)) kiteExpired = true;
    }
  }
  if (input.stopped) {
    for (const s of steps) if (s.status !== 'ok' && s.status !== 'error') s.status = 'stopped';
    for (const s of sources) if (s.status !== 'ok' && s.status !== 'error') s.status = 'stopped';
  }
  const reported = sources.filter((s) => s.rows !== undefined);
  const text = cleanText(input.text);
  let status: AnswerStatus;
  if (input.stopped) status = 'stopped';
  else if (input.error) status = 'error';
  else if (!input.streaming) status = 'done';
  else if (steps.some((s) => s.status === 'running')) status = 'running';
  else if (text.length > 0) status = 'writing';
  else if (steps.length > 0 && steps.every((s) => s.status === 'ok' || s.status === 'error')) status = 'writing';
  else status = 'planning';
  return {
    status,
    watcher,
    text,
    steps,
    sources,
    chart,
    ms: sources.reduce((a, s) => a + (s.ms ?? 0), 0),
    rows: reported.reduce((a, s) => a + (s.rows ?? 0), 0),
    tokensSent: Math.max(tokensSent > 0 ? 8 : 0, tokensSent),
    asOf: sources.length ? sources[sources.length - 1].asOf : '',
    noData: reported.length > 0 && reported.every((s) => s.rows === 0) && sources.every((s) => s.status === 'ok'),
    kiteExpired,
    error: input.error,
  };
}

/** The one-line status above an answer. */
export function statusLine(m: AnswerModel): string {
  switch (m.status) {
    case 'planning':
      return 'Making a plan…';
    case 'running': {
      const i = m.steps.findIndex((s) => s.status === 'running');
      return `Step ${i + 1} of ${m.steps.length}…`;
    }
    case 'writing':
      return 'Writing the answer…';
    case 'stopped':
      return m.kiteExpired ? 'Answer interrupted' : 'Stopped';
    case 'error':
      if (m.kiteExpired) return 'Answer interrupted';
      return /timed? ?out|timeout/i.test(m.error ?? '') ? 'Answer timed out' : 'Couldn’t get an answer';
    default:
      if (m.noData) return `No market data found · ${m.rows} candles`;
      if (m.kiteExpired) return 'Answer interrupted';
      if (!m.sources.length) return 'Answered';
      return `Ran next to the data · ${m.sources.length} ${m.sources.length === 1 ? 'request' : 'requests'}${m.ms ? ` · ${m.ms} ms` : ''}`;
  }
}
