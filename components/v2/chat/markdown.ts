import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { uiBlockHtml } from './ui-blocks';

/**
 * Markdown → HTML the way the prototype does it (markets-hero app.js `md`):
 * fenced `ui:*` blocks become components (a half-arrived one a skeleton),
 * marked with GFM + breaks, sanitised, tables wrapped in `.tw` for scrolling,
 * numeric cells tagged `.num`. `@@chart` / `@@source` lines never reach here
 * (`cleanText` removes them).
 */

const SKELETON = '<div class="ui sk" aria-hidden="true"><i></i><i></i><i></i></div>';

export function renderMarkdown(text: string): string {
  const store: string[] = [];
  const withBlocks = text
    .replace(/```ui:(\w+)\n([\s\S]*?)\n```/g, (_m, type: string, json: string) => {
      store.push(uiBlockHtml(type, json));
      return `\n\n@@UI${store.length - 1}@@\n\n`;
    })
    .replace(/```ui:(\w*)[\s\S]*$/, () => {
      store.push(SKELETON);
      return `\n\n@@UI${store.length - 1}@@\n\n`;
    });
  const html = marked.parse(withBlocks, { gfm: true, breaks: true, async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })
    .replace(/<table>/g, '<div class="tw"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<td>([\s\d.,%+\-−₹$]+)<\/td>/g, '<td class="num">$1</td>')
    .replace(/(?:<p>)?@@UI(\d+)@@(?:<\/p>)?/g, (_m, i: string) => store[Number(i)] ?? '');
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** The prototype's tiny Python highlighter: comments and strings only. */
export function highlightPython(code: string): string {
  return escapeHtml(code)
    .replace(/(#[^\n]*)/g, '<i class="c">$1</i>')
    .replace(/(&quot;[^&]*?&quot;)/g, '<i class="s">$1</i>');
}
