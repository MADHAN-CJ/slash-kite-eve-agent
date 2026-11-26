import { describe, expect, it } from 'vitest';
import { decryptFromMcp, encryptForMcp, otpHash } from '@/lib/server/mcp-crypto';

/**
 * The MCP (Python, zap_kite_mcp/crypto.py) must be able to read what this app
 * writes into ITS tables: Kite tokens in broker_connections and login-code
 * hashes in otps. These vectors were produced by the Python implementation
 * with the same secret, so a change on either side fails here first.
 */
const SECRET = '0123456789abcdef0123456789abcdef';
const PYTHON_CIPHERTEXT = 'v1:osztS8omxCt-t-Qj:6rOg7k93dR4NLtzOnu4Wn7UeCuHm1JOwlswkFj7DAw9omA';
const PYTHON_OTP_HASH = '9910df133664d5f78bcd454cc46f78b3bbb54daf11e1667c005f4aa4221b35f4';

describe('crypto compatibility with the Python MCP', () => {
  it('decrypts a Python-produced Kite token', () => {
    expect(decryptFromMcp(PYTHON_CIPHERTEXT, SECRET)).toBe('access-token-value');
  });

  it('round-trips in the same format', () => {
    const stored = encryptForMcp('another-token', SECRET);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored.split(':')).toHaveLength(3);
    expect(decryptFromMcp(stored, SECRET)).toBe('another-token');
  });

  it('hashes login codes identically (email lower-cased)', () => {
    expect(otpHash('123456', 'Dev@Example.com', SECRET)).toBe(PYTHON_OTP_HASH);
  });

  it('rejects tampering', () => {
    const stored = encryptForMcp('x', SECRET);
    expect(() => decryptFromMcp(`${stored.slice(0, -2)}AA`, SECRET)).toThrow();
  });
});
