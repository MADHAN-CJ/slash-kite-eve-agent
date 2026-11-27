import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/emails/variants.json';
import { fill, renderEmail, type MessageKind } from '@/lib/server/notifications/render';

describe('v2 email templates', () => {
  for (const [id, message] of Object.entries(fixtures)) {
    for (const variant of message.variants) {
      it(`${id}:${variant.id} renders HTML and text without unresolved fields`, () => {
        const email = renderEmail(id as MessageKind, {
          email: 'preview@example.com', ...message.data, ...variant.data,
          link: Object.fromEntries(Object.keys(message.links).map((key) => [key, `https://app.example.com/${key}`])),
        });
        expect(email.subject).toBeTruthy();
        expect(email.html).toContain('#0F1114');
        expect(email.html).not.toMatch(/\{\{|<script|<svg|display:\s*(flex|grid)/);
        expect(email.text).not.toContain('{{');
        for (const key of Object.keys(message.links)) {
          expect(email.html).toContain(`https://app.example.com/${key}`);
          expect(email.text).toContain(`https://app.example.com/${key}`);
        }
      });
    }
  }

  it('escapes user text, including quotes, without reinterpreting template syntax', () => {
    expect(fill('{{value}}', { value: '<img src="x"> & {{code}}' }))
      .toBe('&lt;img src=&quot;x&quot;&gt; &amp; {{code}}');
  });
  it('supports nested lists and optional sections', () => {
    expect(fill('{{#items}}{{name}}:{{#values}}{{.}}{{/values}}{{/items}}{{^missing}}!{{/missing}}',
      { items: [{ name: 'A', values: [1, 2] }] })).toBe('A:12!');
  });
  it('rejects missing data and unsafe raw fields', () => {
    expect(() => renderEmail('otp', {})).toThrow('Missing email data');
    expect(() => fill('{{{value}}}', { value: '<script>' })).toThrow('Unsafe raw email field');
  });
  it('rejects unsafe action links', () => {
    expect(() => renderEmail('kite-nudge', { link: { connect: 'javascript:alert(1)' } })).toThrow('HTTPS');
  });
});
