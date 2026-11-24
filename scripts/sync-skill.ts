import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Builds agent/skills/kite-markets/SKILL.md (gitignored) = our preface + the
 * Kite MCP's model-facing SKILL.md. The upstream body is fetched from
 * KITE_SKILL_URL at boot (plan D8 — the MCP does not serve it, so the public
 * repo's raw file is the source) and falls back to the committed copy in
 * skill-src/upstream.md. A fetched body replaces the fallback only when it
 * still looks like the guide (mentions run_python and zapkite), so a bad
 * fetch can never ship an empty or foreign skill.
 */
const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT = join(ROOT, 'agent/skills/kite-markets/SKILL.md');
const PREFACE = join(ROOT, 'skill-src/preface.md');
const FALLBACK = join(ROOT, 'skill-src/upstream.md');
const URL_ = process.env.KITE_SKILL_URL ?? 'https://raw.githubusercontent.com/MADHAN-CJ/zap-kite-mcp/prod/mcp/SKILL.md';

const DESCRIPTION =
  'Use for ANY question about the user\'s Zerodha account (positions, holdings, funds, orders, trades, ' +
  'mutual funds, GTTs) or Indian market data (NSE/BSE stocks and indices, NFO/BFO F&O, MCX commodities, ' +
  'CDS currency: prices, candles, indicators, option chains with greeks, expiries, continuous futures) and ' +
  'for arming e-mail watchers. Load it BEFORE the first kite__run_python call: it documents the zapkite ' +
  'Python library, the one-script-per-question rules, the @@chart line, and when to use web_search instead.';

function looksLikeGuide(text: string): boolean {
  return text.includes('run_python') && text.includes('zapkite') && text.length > 2000;
}

function stripFrontmatter(md: string): string {
  const m = /^---\n[\s\S]*?\n---\n/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

async function upstream(): Promise<{ body: string; source: string }> {
  const fallback = readFileSync(FALLBACK, 'utf8');
  try {
    const res = await fetch(URL_, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const text = await res.text();
      if (looksLikeGuide(text)) {
        if (text !== fallback) writeFileSync(FALLBACK, text);
        return { body: text, source: URL_ };
      }
      console.warn(`[sync-skill] ${URL_} did not look like the guide — using the committed copy`);
    } else {
      console.warn(`[sync-skill] ${URL_} → ${res.status} — using the committed copy`);
    }
  } catch (e) {
    console.warn(`[sync-skill] fetch failed (${e instanceof Error ? e.message : e}) — using the committed copy`);
  }
  return { body: fallback, source: FALLBACK };
}

async function main() {
  const { body, source } = await upstream();
  const preface = readFileSync(PREFACE, 'utf8');
  const skill = `---\nname: kite-markets\ndescription: ${JSON.stringify(DESCRIPTION)}\n---\n\n${preface}${stripFrontmatter(body)}`;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, skill);
  console.log(`[sync-skill] wrote ${OUT} (${skill.length} chars) from ${source}`);
}

main().catch((e) => {
  console.error('[sync-skill] failed:', e);
  process.exit(1);
});
