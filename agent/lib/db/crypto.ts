import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * At-rest protection for THIS app's secrets (the cached MCP access tokens in
 * eve.mcp_grants): AES-256-GCM with a key derived from CREDS_ENCRYPTION_KEY.
 * Decryption happens solely inside the MCP connection's token resolver —
 * never in the model context. Rotating the key only drops the token cache
 * (tokens are re-minted on demand). Secrets the MCP must read back (Kite
 * sessions) use the MCP's own format instead — see lib/server/mcp-crypto.ts.
 */

const ENC_VERSION = 'v1';

function requireSecret(name: 'CREDS_ENCRYPTION_KEY'): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`${name} must be set to a random secret of at least 16 characters.`);
  }
  return value;
}

/** 32-byte AES key derived from the configured secret (accepts any-length secret). */
function encryptionKey(): Buffer {
  return createHash('sha256').update(requireSecret('CREDS_ENCRYPTION_KEY')).digest();
}

/** Encrypt a secret for at-rest storage: `v1:<iv>:<ciphertext>:<tag>` (base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_VERSION, iv.toString('base64'), ciphertext.toString('base64'), tag.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, ciphertext, tag] = stored.split(':');
  if (version !== ENC_VERSION || !iv || !ciphertext || !tag) {
    throw new Error(`Unsupported ciphertext version: ${version ?? 'none'}`);
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
