import { escapeHtml as esc } from './markdown';

/**
 * Generative blocks the answer may carry as fenced JSON (markets-hero
 * app.js `UI`): ```ui:levels```, ```ui:stat``` and ```ui:followups```. The
 * skill asks the model for them where they fit; anything else is dropped.
 * `ui:sources` and `ui:watcher` are not blocks here — sources come from the
 * tool calls and the watcher card from the confirm step.
 */

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (n: unknown): string => num(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export interface LevelsBlock {
  symbol?: string;
  tf?: string;
  price?: number;
  levels?: { label?: string; price?: number; kind?: 'support' | 'resistance' }[];
}

export function levelsHtml(p: LevelsBlock): string {
  const rows = (p.levels ?? []).map((l) => ({ label: String(l.label ?? ''), price: num(l.price), res: l.kind === 'resistance', now: false }));
  if (p.price != null) rows.push({ label: 'Current price', price: num(p.price), res: false, now: true });
  rows.sort((a, b) => b.price - a.price);
  return (
    `<figure class="ui levels"><figcaption><b>${esc(p.symbol ?? '')}</b><span>Key levels · ${esc(p.tf ?? '1D')}</span></figcaption>` +
    rows.map((r) => `<div class="lr2${r.now ? ' now' : ''}"><i class="${r.now ? 'n' : r.res ? 'r' : 's'}"></i><span>${esc(r.label)}</span><b>${fmt(r.price)}</b></div>`).join('') +
    '</figure>'
  );
}

export interface StatBlock {
  symbol?: string;
  label?: string;
  value?: string | number;
  note?: string;
  zones?: [string, string][];
  at?: number;
}

export function statHtml(p: StatBlock): string {
  return (
    `<figure class="ui stat"><figcaption><b>${esc(p.symbol ?? '')}</b><span>${esc(p.label ?? '')}</span></figcaption>` +
    `<div class="sv"><b>${esc(String(p.value ?? ''))}</b><span>${esc(p.note ?? '')}</span></div>` +
    (p.zones ?? []).map((z, i) => `<div class="zr${i === p.at ? ' on' : ''}"><span>${esc(String(z[0]))}</span><span>${esc(String(z[1]))}</span></div>`).join('') +
    '</figure>'
  );
}

export function followupsHtml(a: unknown): string {
  const list = Array.isArray(a) ? a.slice(0, 5) : [];
  return `<div class="fu">${list.map((t) => `<button type="button">${esc(String(t))}</button>`).join('')}</div>`;
}

export function uiBlockHtml(type: string, json: string): string {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return '';
  }
  if (type === 'levels' && o && typeof o === 'object') return levelsHtml(o as LevelsBlock);
  if (type === 'stat' && o && typeof o === 'object') return statHtml(o as StatBlock);
  if (type === 'followups') return followupsHtml(o);
  return '';
}

/** The follow-up questions a `ui:followups` block carries, for the lab and tests. */
export function followupsOf(text: string): string[] {
  const m = /```ui:followups\n([\s\S]*?)\n```/.exec(text);
  if (!m) return [];
  try {
    const a = JSON.parse(m[1]) as unknown;
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
