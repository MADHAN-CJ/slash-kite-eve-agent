import { describe, expect, it } from 'vitest';
import { createdWatcherId } from '@/agent/lib/db/mirror';
import { guessesFrom, watchPrompt } from '@/components/v2/chat/watcher-card';
import { buildAnswer } from '@/lib/v2/answer-model';
import { LAB_NOW, labWatchers } from '@/lib/v2/lab-watchers';
import { WATCH_TOOLS } from '@/lib/v2/lab-replay';
import { bigNumber, everyText, gapText, levelOf, LIVE, toW8, whenText } from '@/lib/v2/watcher-view';

const byId = (state: string, id: string) => {
  const w = labWatchers(state).find((x) => x.id === id);
  if (!w) throw new Error(id);
  return toW8(w, LAB_NOW);
};

describe('the Watchers view model', () => {
  it('reads the level and its direction from the rule, and nothing when it does not say', () => {
    expect(levelOf('15-min candle closes below 2,912')).toEqual({ level: 2912, direction: 'below' });
    expect(levelOf('RSI(14) on 15 min goes above 70')).toEqual({ level: 70, direction: 'above' });
    expect(levelOf('Put-call ratio falls under 0.70')).toEqual({ level: 0.7, direction: 'below' });
    expect(levelOf('Volume spike on INFY')).toBeNull();
  });

  it('maps statuses the way the prototype names them', () => {
    expect(byId('active', 'w1').st).toBe('watching');
    expect(byId('active', 'w2').st).toBe('met');
    expect(byId('active', 'w5')).toMatchObject({ st: 'paused', kitePaused: false });
    expect(byId('kite', 'w2')).toMatchObject({ st: 'paused', kitePaused: true });
    expect(byId('active', 'w6').st).toBe('error');
    expect(LIVE(byId('active', 'w7'))).toBe(false);
    expect(byId('active', 'w8')).toMatchObject({ st: 'cancelled', ended: '20 Nov' });
  });

  it('writes the numbers and times as the prototype shows them', () => {
    const goldbees = byId('active', 'w2');
    expect(bigNumber(goldbees)).toBe('99.82');
    expect(gapText(goldbees)).toBe('0.18 below your level');
    expect(goldbees.metSince).toBe('14:05');
    expect(goldbees.alerts.map((a) => a.when)).toEqual(['Today 14:05', '19 Nov 10:32']);
    expect(gapText(byId('active', 'w1'))).toBe('36.40 above your level');
    expect(bigNumber(byId('active', 'w3'))).toBe('6,412');
    expect(byId('new', 'w1')).toMatchObject({ started: true, firstCheck: '14:45' });
    expect(byId('active', 'w1').started).toBe(false);
    expect(everyText(1440)).toBe('1 day');
    expect(everyText(60)).toBe('1 hour');
    expect(whenText('2026-11-24T15:30:00+05:30', LAB_NOW).text).toBe('Yesterday 15:30');
  });
});

describe('the watcher confirm card', () => {
  it('parks create_watcher as a card, with the plan ending on Show you the watcher', () => {
    const m = buildAnswer({ text: 'I wrote your rule.', tools: WATCH_TOOLS, streaming: false });
    expect(m.watcher).toMatchObject({ state: 'pending', symbol: 'NSE:RELIANCE', everyMinutes: 15, now: '2,948 · 36 above your level · not met' });
    expect(m.watcher?.approval?.approveId).toBe('approve');
    expect(m.steps.map((s) => s.label)).toEqual(['Write your rule as a short script', 'Test it once on today’s candles', 'Show you the watcher before it starts']);
    expect(m.steps[1].detail).toBe('watcher · dry run · not met');
    expect(m.sources.length).toBe(2);
  });

  it('turns live, declined or failed with the call', () => {
    const [a, b, c] = WATCH_TOOLS;
    const live = buildAnswer({ text: '', tools: [a, b, { ...c, state: 'ok', output: { created: true, watcher: { id: 'abc', market: 'NSE', dryRun: { value: 2948.4 } } } }], streaming: false });
    expect(live.watcher).toMatchObject({ state: 'live', now: '2948.4' });
    expect(buildAnswer({ text: '', tools: [{ ...c, state: 'denied' }], streaming: false }).watcher?.state).toBe('declined');
    expect(buildAnswer({ text: '', tools: [{ ...c, state: 'ok', output: { created: false, error: 'bad script' } }], streaming: false }).watcher).toMatchObject({ state: 'failed', error: 'bad script' });
  });

  it('reads the created watcher id from every result shape', () => {
    const body = { created: true, error: null, watcher: { id: 'w-1' } };
    expect(createdWatcherId(body)).toBe('w-1');
    expect(createdWatcherId({ structuredContent: body })).toBe('w-1');
    expect(createdWatcherId({ content: [{ type: 'text', text: JSON.stringify(body) }] })).toBe('w-1');
    expect(createdWatcherId(JSON.stringify(body))).toBe('w-1');
    expect(createdWatcherId({ created: false, watcher: null })).toBeNull();
  });

  it('guesses levels for Watch this from the answer', () => {
    const text = 'x\n\n```ui:levels\n{"symbol":"RELIANCE","levels":[{"label":"Resistance","price":2984,"kind":"resistance"},{"label":"Support","price":2912,"kind":"support"}]}\n```';
    const g = guessesFrom(text);
    expect(g?.guesses.map((x) => [x.dir, x.lv])).toEqual([['above', 2984], ['below', 2912]]);
    expect(watchPrompt('RELIANCE', g?.guesses[1] ?? { dir: 'below', lv: 0, why: '' })).toBe('Tell me when RELIANCE closes below 2,912 on the 15-min chart');
    expect(guessesFrom('no levels here')).toBeNull();
  });
});
