import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The generated skill is what tells the model which indicators exist and how
 * to use this app's tools. These checks guard the contract between the
 * preface, the upstream guide and the agent: every supported indicator and
 * every rule the instructions rely on must be present.
 */
const GENERATED = 'agent/skills/kite-markets/SKILL.md';
const skill = existsSync(GENERATED)
  ? readFileSync(GENERATED, 'utf8')
  : `${readFileSync('skill-src/preface.md', 'utf8')}${readFileSync('skill-src/upstream.md', 'utf8')}`;

const INDICATORS = ['z.sma(', 'z.ema(', 'z.rsi(', 'z.macd(', 'z.bollinger(', 'z.atr(', 'z.vwap(', 'z.pct_change(', 'z.closes('];
const DATA_FUNCTIONS = ['z.intraday_candles(', 'z.daily_candles(', 'z.continuous_futures(', 'z.option_chain(', 'z.expiry_list(', 'z.ltp(', 'z.quote(', 'z.ohlc(', 'z.positions(', 'z.holdings(', 'z.funds('];

describe('kite-markets skill', () => {
  it('documents every supported indicator and data function', () => {
    for (const name of [...INDICATORS, ...DATA_FUNCTIONS]) expect(skill, name).toContain(name);
  });

  it('maps the prefixed tool names the agent actually calls', () => {
    for (const t of ['kite__run_python', 'kite__auth_status', 'kite__create_watcher', 'kite__list_watchers', 'kite__profile']) {
      expect(skill).toContain(t);
    }
  });

  it('states the web-search rules and the @@chart protocol', () => {
    expect(skill).toMatch(/web_search/);
    expect(skill).toMatch(/Never for prices, P&L, account\s+data or candles/);
    expect(skill).toContain('@@chart ');
    expect(skill).toContain('"type":"candles"');
    expect(skill).toContain('"type":"option_chain"');
  });

  it('tells the model there is no local sandbox and how to handle access errors', () => {
    expect(skill).toMatch(/no bash, no files, no local Python/);
    expect(skill).toContain('MCP_NOT_CONNECTED');
    expect(skill).toContain('TokenExpired');
  });

  it('keeps the upstream guide intact (stdlib-only, one script per question)', () => {
    expect(skill).toMatch(/Standard library only/);
    expect(skill).toMatch(/import zapkite as z/);
    expect(skill).toMatch(/read-only[:.] there is no order placement/i);
  });
});
