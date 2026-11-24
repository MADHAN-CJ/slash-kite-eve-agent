import { extractChartLine, stdoutOf } from '@/components/charts/chart-line';
import { resultText } from '@/components/charts/tool-result-chart';

export interface SourceCard {
  title: string;
  url: string;
  snippet?: string;
  published?: string;
}

/** `web_search` results as citation cards, or null when the output isn't a search result. */
export function sourceCards(toolName: string, output: unknown): SourceCard[] | null {
  if (toolName !== 'web_search' || !output || typeof output !== 'object') return null;
  const results = (output as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  const cards = results
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .filter((r) => typeof r.url === 'string')
    .map((r) => ({
      title: typeof r.title === 'string' && r.title ? r.title : (r.url as string),
      url: r.url as string,
      snippet: typeof r.snippet === 'string' ? r.snippet : undefined,
      published: typeof r.published === 'string' ? r.published : undefined,
    }));
  return cards.length ? cards : null;
}

/**
 * What the tool card shows. For `run_python` the `@@chart` line is removed
 * (the chart renders beneath the card instead); everything else is untouched.
 */
export function displayToolOutput(toolName: string, output: unknown): unknown {
  if (!toolName.endsWith('run_python')) return output;
  const text = resultText(output);
  if (!text) return output;
  const { chart } = extractChartLine(stdoutOf(text));
  if (!chart) return output;
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('@@chart '))
    .join('\n');
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
