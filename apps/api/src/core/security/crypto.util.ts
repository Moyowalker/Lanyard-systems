import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** SHA-256 hex digest — used to store refresh tokens and OTP codes (never plaintext). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Cryptographically-random, URL-safe opaque token (default 32 bytes ≈ 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Numeric OTP code of the given length (default 6), zero-padded. */
export function randomOtp(length = 6): string {
  const max = 10 ** length;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return n.toString().padStart(length, '0');
}

export function newUuid(): string {
  return randomUUID();
}

/** Parse durations like "15m", "30d", "12h", "45s" into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: "${value}"`);
  const amount = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * factors[unit];
}
