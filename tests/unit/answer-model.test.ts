import { describe, expect, it } from 'vitest';
import { buildAnswer, cleanText, commentInCode, durationOf, extractSourceLine, normalizeActivity, statusLine, symbolInCode } from '@/lib/v2/answer-model';
import { storedAnswer } from '@/lib/v2/answer-parts';
import { followupsOf, levelsHtml } from '@/components/v2/chat/ui-blocks';
import { NO_DATA_TOOLS, RELIANCE_TOOLS } from '@/lib/v2/lab-replay';

describe('script output lines', () => {
  it('reads the @@source line in either order with @@chart', () => {
    const src = '{"dataset":"Price history","symbol":"RELIANCE","rows":60,"values":[["Last","2,948"]]}';
    const a = extractSourceLine(`x: 1\n@@source ${src}\n@@chart {"type":"candles","rows":[]}`);
    const b = extractSourceLine(`x: 1\n@@chart {"type":"candles","rows":[]}\n@@source ${src}`);
    expect(a.meta?.rows).toBe(60);
    expect(b.meta?.symbol).toBe('RELIANCE');
    expect(a.text).toContain('@@chart');
    expect(a.text).not.toContain('@@source');
    expect(extractSourceLine('plain\noutput').meta).toBeNull();
    expect(extractSourceLine('x\n@@source not json').meta).toBeNull();
  });

  it('reads the runner head, the symbol and the comment from a script', () => {
    expect(durationOf('exit_code=0 duration=142ms\n--- stdout ---\nok')).toBe(142);
    expect(symbolInCode('q = z.quote(["NSE:INFY"])')).toBe('NSE:INFY');
    expect(symbolInCode('s = z.resolve_symbol("tcs")')).toBe('TCS');
    expect(commentInCode('# Get the last 60 daily candles for RELIANCE.\nx=1')).toBe('Get the last 60 daily candles for RELIANCE');
    expect(commentInCode('x=1')).toBe('');
  });

  it('keeps the component blocks and drops the rest', () => {
    const t = 'A\n\n```ui:levels\n{}\n```\n\n```ui:sources\n[]\n```\n\n@@chart {}\n\nB';
    const c = cleanText(t);
    expect(c).toContain('ui:levels');
    expect(c).not.toContain('ui:sources');
    expect(c).not.toContain('@@chart');
    expect(followupsOf('x\n\n```ui:followups\n["a","b"]\n```')).toEqual(['a', 'b']);
    expect(levelsHtml({ symbol: 'X', price: 10, levels: [{ label: 'S', price: 9, kind: 'support' }] })).toContain('lr2 now');
  });
});

describe('the answer model', () => {
  it('turns the Reliance run into two sources, a plan and a receipt', () => {
    const m = buildAnswer({ text: 'Hello', tools: RELIANCE_TOOLS, streaming: false });
    expect(m.status).toBe('done');
    expect(m.sources.map((s) => [s.n, s.dataset, s.symbol, s.rows, s.ms])).toEqual([
      [1, 'Price history', 'RELIANCE', 60, 142],
      [2, 'Quote', 'RELIANCE', 1, 88],
    ]);
    expect(m.steps.map((s) => s.label)).toEqual(['Get the last 60 daily candles for RELIANCE', 'Compare them with today’s price']);
    expect(m.steps[0].detail).toBe('python · RELIANCE 1D · 60 candles');
    expect(m.rows).toBe(61);
    expect(m.ms).toBe(230);
    expect(m.asOf).toBe('14:32:05');
    expect(m.tokensSent).toBeGreaterThan(8);
    expect(statusLine(m)).toBe('Ran next to the data · 2 requests · 230 ms');
  });

  it('knows the live phases', () => {
    expect(statusLine(buildAnswer({ text: '', tools: [], streaming: true }))).toBe('Making a plan…');
    const running = buildAnswer({ text: '', tools: [{ ...RELIANCE_TOOLS[0], output: undefined, state: 'running' }], streaming: true });
    expect(statusLine(running)).toBe('Step 1 of 1…');
    expect(statusLine(buildAnswer({ text: 'Some', tools: RELIANCE_TOOLS, streaming: true }))).toBe('Writing the answer…');
  });

  it('marks stopped, timed out, interrupted and no-data runs', () => {
    const stopped = buildAnswer({ text: 'Half', tools: [{ ...RELIANCE_TOOLS[0], output: undefined, state: 'running' }], streaming: false, stopped: true });
    expect(stopped.status).toBe('stopped');
    expect(stopped.steps[0].status).toBe('stopped');
    expect(statusLine(buildAnswer({ text: '', tools: RELIANCE_TOOLS, streaming: false, error: 'Answer timed out' }))).toBe('Answer timed out');
    const expired = buildAnswer({
      text: '',
      tools: [{ callId: 'e', toolName: 'kite__run_python', input: { code: 'x' }, error: 'TokenExpired: log in again', state: 'error' }],
      streaming: false,
      stopped: true,
    });
    expect(expired.kiteExpired).toBe(true);
    expect(statusLine(expired)).toBe('Answer interrupted');
    const none = buildAnswer({ text: 'Nothing', tools: NO_DATA_TOOLS, streaming: false });
    expect(none.noData).toBe(true);
    expect(statusLine(none)).toBe('No market data found · 0 candles');
  });

  it('reads an MCP tool failure delivered as an isError output', () => {
    const a = normalizeActivity({ callId: 'x', toolName: 'kite__run_python', input: { code: '# Get LTP\nx' }, state: 'ok', output: { isError: true, content: [{ type: 'text', text: 'Error executing tool run_python: exit_code=1 duration=37ms\n--- stdout ---\n(empty)\n--- stderr ---\nTokenExpired: log in again' }] } });
    expect(a.state).toBe('error');
    expect(durationOf(a.error ?? '')).toBe(37);
    const m = buildAnswer({ text: '', tools: [a], streaming: false });
    expect(m.sources[0].status).toBe('error');
    expect(m.sources[0].dataset).toBe('Script failed');
    expect(m.sources[0].ms).toBe(37);
    expect(m.kiteExpired).toBe(true);
  });

  it('reduces persisted parts the same way, and treats a web search as a source', () => {
    const m = storedAnswer(
      'Text',
      [
        { type: 'tool_call', toolCallId: 'a', toolName: 'load_skill', input: { name: 'kite-markets' } },
        { type: 'tool_result', toolCallId: 'a', toolName: 'load_skill', output: 'skill text' },
        { type: 'tool_call', toolCallId: 'b', toolName: 'web_search', input: { query: 'nifty news' } },
        { type: 'tool_result', toolCallId: 'b', toolName: 'web_search', output: { results: [{ title: 'T', url: 'https://x.y/z' }] } },
        { type: 'tool_call', toolCallId: 'c', toolName: 'kite__run_python', input: { code: 'print(1)' } },
        { type: 'tool_error', toolCallId: 'c', toolName: 'kite__run_python', error: 'Traceback: boom' },
      ],
      '2026-11-26T09:02:03.000Z',
    );
    expect(m.steps.map((s) => s.label)).toEqual(['Read the zapkite guide', 'Search the web for “nifty news”', 'Run a script next to the data']);
    expect(m.sources.length).toBe(2);
    expect(m.sources[0].kind).toBe('search');
    expect(m.sources[0].values).toEqual([['T', 'https://x.y/z']]);
    expect(m.sources[1].status).toBe('error');
    expect(m.sources[1].asOf).toBe('14:32:03');
  });
});

describe('stored approvals (plan-v2 D8)', () => {
  it('a parked create_watcher with a stored input_request comes back as the pending confirm card', async () => {
    const { storedAnswer } = await import('@/lib/v2/answer-parts');
    const m = storedAnswer(
      '',
      [
        { type: 'tool_call', toolCallId: 'c1', toolName: 'kite__create_watcher', input: { symbol: 'GOLDBEES', label: 'GOLDBEES drops below ₹100', script: 'print(1)', market: 'NSE' } },
        { type: 'input_request', toolCallId: 'c1', toolName: 'kite__create_watcher', requestId: 'req_1', options: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }] },
      ],
      new Date().toISOString(),
    );
    expect(m.watcher?.state).toBe('pending');
    expect(m.watcher?.approval).toEqual({ requestId: 'req_1', approveId: 'approve', rejectId: 'reject' });
    expect(m.status).not.toBe('error');
  });
  it('a parked call that was never approved is not shown as a failure', async () => {
    const { storedAnswer } = await import('@/lib/v2/answer-parts');
    const m = storedAnswer('', [{ type: 'tool_call', toolCallId: 'c1', toolName: 'kite__create_watcher', input: { symbol: 'X' } }], new Date().toISOString());
    expect(m.watcher?.state).toBe('failed');
  });
});
