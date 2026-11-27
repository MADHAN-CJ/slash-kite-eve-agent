/** Offline parity check. Reads the design repo; never changes its files. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { renderEmail, type MessageKind } from '../lib/server/notifications/render';

const source = resolve(process.env.V2_DESIGN_ROOT ?? '../markets-hero', 'ux/messages');
const output = resolve('.v2-compare/emails');
mkdirSync(output, { recursive: true });
const sandbox = { module: { exports: {} as { render: (t: string, d: Record<string, unknown>, html?: boolean) => string } } };
runInNewContext(readFileSync(resolve(source, 'render.js'), 'utf8'), sandbox);
const reference = sandbox.module.exports.render;
const layout = readFileSync(resolve(source, 'layout.html'), 'utf8');
let count = 0;
for (const id of ['otp', 'kite-nudge', 'kite-reconnect', 'watcher-alert', 'watcher-stopped', 'watcher-ended'] as MessageKind[]) {
  const message = JSON.parse(readFileSync(resolve(source, id, 'message.json'), 'utf8'));
  for (const variant of message.variants) {
    const data = {
      email: 'preview@example.com', ...message.data, ...variant.data,
      link: Object.fromEntries(Object.keys(message.links).map((key) => [key, `https://app.example.com/${key}`])),
    };
    // Use local reference charts only in offline previews.
    if (data.chart) data.chart = `file://${resolve(source, id, data.chart)}`;
    const fields = { ...data, footer: reference(message.footer, data, false) };
    const subject = reference(message.subject, fields, false);
    const preheader = reference(message.preheader, fields, false);
    const body = reference(readFileSync(resolve(source, id, 'email.html'), 'utf8'), fields);
    const expected = {
      subject,
      html: reference(layout, { ...fields, subject, preheader, body }),
      text: reference(readFileSync(resolve(source, id, 'email.txt'), 'utf8'), fields, false),
    };
    const actual = renderEmail(id, data);
    for (const key of ['subject', 'html', 'text'] as const) {
      if (actual[key] !== expected[key]) throw new Error(`${id}:${variant.id} ${key} differs from prototype`);
    }
    writeFileSync(resolve(output, `${id}-${variant.id}.html`), actual.html);
    count++;
  }
}
console.log(`${count} email variants match prototype HTML, subject and plain text exactly. Previews: ${output}`);
