import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Byte-compatible with the MCP's `zap_kite_mcp/crypto.py` (and the retired
 * web app's lib/server/crypto.ts). Two things this app writes must be readable
 * by the Python MCP, so they use ITS secrets, not ours:
 *
 *  - Kite access tokens in `broker_connections.access_token_enc`
 *    (AES-256-GCM, key = sha256(MCP_CREDS_ENCRYPTION_KEY), `v1:<nonce>:<sealed>`
 *    base64url, GCM tag appended to the ciphertext);
 *  - login-code hashes in `otps.code_hash`
 *    (HMAC-SHA256 keyed by sha256("otp:" + MCP_SESSION_SECRET) over `code:email`).
 *
 * MCP_SESSION_SECRET / MCP_CREDS_ENCRYPTION_KEY = the MCP deployment's
 * SESSION_SECRET / CREDS_ENCRYPTION_KEY. Pinned per environment.
 */

const VERSION = 'v1';

function requireSecret(name: 'MCP_SESSION_SECRET' | 'MCP_CREDS_ENCRYPTION_KEY'): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to the MCP's secret (at least 32 characters).`);
  }
  return value;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');
const unb64url = (text: string): Buffer => Buffer.from(text, 'base64url');

function aesKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptForMcp(plaintext: string, secret = requireSecret('MCP_CREDS_ENCRYPTION_KEY')): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey(secret), nonce);
  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}:${b64url(nonce)}:${b64url(sealed)}`;
}

export function decryptFromMcp(stored: string, secret = requireSecret('MCP_CREDS_ENCRYPTION_KEY')): string {
  const [version, nonce, sealed] = stored.split(':');
  if (version !== VERSION || !nonce || !sealed) {
    throw new Error(`unsupported ciphertext version ${version ?? ''}`);
  }
  const data = unb64url(sealed);
  const decipher = createDecipheriv('aes-256-gcm', aesKey(secret), unb64url(nonce));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8');
}

function mac(secret: string, purpose: string, message: string): Buffer {
  const key = createHash('sha256').update(`${purpose}:${secret}`).digest();
  return createHmac('sha256', key).update(message).digest();
}

/** `otps.code_hash` — identical to Python `otp_hash(secret, code, email)`. */
export function otpHash(code: string, email: string, secret = requireSecret('MCP_SESSION_SECRET')): string {
  return mac(secret, 'otp', `${code}:${email.toLowerCase()}`).toString('hex');
}
