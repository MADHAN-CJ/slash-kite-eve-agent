import templates from './templates.json';

export type MessageKind = keyof typeof templates.messages;
export interface RenderedEmail { subject: string; html: string; text: string }
export type EmailData = Record<string, unknown>;

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function lookup(stack: unknown[], path: string): unknown {
  if (path === '.') return stack.at(-1);
  for (let i = stack.length - 1; i >= 0; i--) {
    let value = stack[i];
    let found = true;
    for (const key of path.split('.')) {
      if (value !== null && typeof value === 'object' && Object.hasOwn(value, key)) {
        value = (value as EmailData)[key];
      } else { found = false; break; }
    }
    if (found) return value;
  }
  return undefined;
}

/** The prototype's Mustache subset. Missing required data fails closed. */
export function fill(template: string, data: EmailData, html = true): string {
  function render(input: string, stack: unknown[]): string {
    const tags = /\{\{(\{?)\s*([#^/]?)\s*([\w.\-]+)\s*\}?\}\}/g;
    let output = '', offset = 0;
    let match: RegExpExecArray | null;
    while ((match = tags.exec(input))) {
      output += input.slice(offset, match.index);
      offset = tags.lastIndex;
      const [, raw, kind, name] = match;
      if (kind === '#' || kind === '^') {
        const end = new RegExp('\\{\\{\\s*([#^/])\\s*' + name.replace(/[.\-]/g, '\\$&') + '\\s*\\}\\}', 'g');
        end.lastIndex = offset;
        let depth = 1, closing: RegExpExecArray | null;
        while ((closing = end.exec(input))) {
          if (closing[1] === '/') { if (--depth === 0) break; }
          else depth++;
        }
        if (!closing) throw new Error(`Missing closing email section: ${name}`);
        const inner = input.slice(offset, closing.index);
        offset = tags.lastIndex = end.lastIndex;
        const value = lookup(stack, name);
        const empty = value == null || value === false || value === '' || (Array.isArray(value) && !value.length);
        if (kind === '^') { if (empty) output += render(inner, stack); }
        else if (!empty) {
          output += Array.isArray(value) ? value.map((item) => render(inner, [...stack, item])).join('')
            : render(inner, typeof value === 'object' ? [...stack, value] : stack);
        }
      } else if (kind === '/') throw new Error(`Unexpected closing email section: ${name}`);
      else {
        const value = lookup(stack, name);
        if (value === undefined) throw new Error(`Missing email data: ${name}`);
        // Only the trusted, already-rendered template body can bypass escaping.
        if (raw && name !== 'body') throw new Error(`Unsafe raw email field: ${name}`);
        output += html && !raw ? escape(value) : String(value ?? '');
      }
    }
    return output + input.slice(offset);
  }
  return render(template, [data]);
}

/** Production supplies every value; prototype sample data is never imported here. */
export function renderEmail(kind: MessageKind, data: EmailData): RenderedEmail {
  const template = templates.messages[kind];
  for (const value of Object.values((data.link ?? {}) as EmailData)) {
    if (typeof value !== 'string' || !/^https:\/\//.test(value)) throw new Error('Email links must use HTTPS');
  }
  const fields = { ...data, footer: fill(template.footer, data, false) };
  const subject = fill(template.subject, fields, false);
  if (/[\r\n]/.test(subject)) throw new Error('Invalid email subject');
  const preheader = fill(template.preheader, fields, false);
  const body = fill(template.html, fields);
  return {
    subject,
    html: fill(templates.layout, { ...fields, subject, preheader, body }),
    text: fill(template.text, fields, false),
  };
}
