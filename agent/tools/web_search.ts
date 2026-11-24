import { defineTool } from 'eve/tools';
import { z } from 'zod';

/**
 * Web search via Tavily (plan D7) — replaces eve's provider-run default.
 * For news, events, results dates, corporate actions, policy and macro;
 * never for prices or account data (those come from the kite connection).
 * Returns compact results with URLs so the model can cite them and the UI
 * can render source cards. Errors come back as `{ error }`, never thrown.
 */

const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_RESULTS = 8;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
  score?: number;
}

export default defineTool({
  description:
    'Search the web (Tavily) for markets and finance context: news, events, results and earnings dates, ' +
    'corporate actions, policy and macro, "why did X move". NOT for prices, P&L, candles or account data — ' +
    'use the kite connection for those. Keep queries about markets, companies, the economy and finance. ' +
    'Cite the results you use (title + URL).',
  inputSchema: z.object({
    query: z.string().min(3).max(400).describe('The search query, specific and in plain words.'),
    topic: z
      .enum(['news', 'general'])
      .default('news')
      .describe('"news" for recent coverage (default); "general" for background, filings, explainers.'),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('news only: how many days back to look (default 7).'),
    max_results: z.number().int().min(1).max(MAX_RESULTS).default(5),
  }),
  async execute({ query, topic, days, max_results }, ctx) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return { error: 'Web search is not configured on this deployment.' };
    try {
      const res = await fetch(TAVILY_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          topic,
          search_depth: 'basic',
          max_results,
          include_answer: false,
          include_raw_content: false,
          ...(topic === 'news' ? { days: days ?? 7 } : {}),
        }),
        signal: AbortSignal.any([ctx.abortSignal, AbortSignal.timeout(20_000)]),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { error: `Search failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}` };
      }
      const body = (await res.json()) as {
        results?: { title?: string; url?: string; content?: string; published_date?: string; score?: number }[];
      };
      const results: WebSearchResult[] = (body.results ?? [])
        .filter((r) => typeof r.url === 'string' && r.url.length > 0)
        .map((r) => ({
          title: (r.title ?? r.url ?? '').slice(0, 200),
          url: r.url as string,
          snippet: (r.content ?? '').slice(0, 600),
          published: r.published_date,
          score: typeof r.score === 'number' ? Number(r.score.toFixed(3)) : undefined,
        }));
      return { query, topic, results };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { error: aborted ? 'Search was cancelled or timed out.' : `Search failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
});
