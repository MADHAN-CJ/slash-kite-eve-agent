import { afterAll, beforeAll, describe } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { requireLiveKite } from '../helpers/mcp';

/**
 * Shared harness: every indicator file opens its own MCP client (files run in
 * parallel workers) and is skipped — reported, not failed — when no live
 * Zerodha session backs the MCP account.
 */
export function describeLive(name: string, body: (ctx: { client: () => Client }) => void): void {
  describe(name, async () => {
    const live = await requireLiveKite();
    if (live.client === undefined) {
      describe.skip(`${name} — skipped: ${live.skip}`, () => {});
      return;
    }
    const client: Client = live.client;
    beforeAll(() => undefined);
    afterAll(async () => {
      await client.close().catch(() => undefined);
    });
    body({ client: () => client });
  });
}
