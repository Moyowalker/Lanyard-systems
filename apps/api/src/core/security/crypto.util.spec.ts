import { parseDurationMs, randomOtp, randomToken, sha256Hex } from './crypto.util';

describe('crypto util', () => {
  it('parseDurationMs handles all supported units', () => {
    expect(parseDurationMs('15m')).toBe(15 * 60_000);
    expect(parseDurationMs('30d')).toBe(30 * 86_400_000);
    expect(parseDurationMs('12h')).toBe(12 * 3_600_000);
    expect(parseDurationMs('45s')).toBe(45_000);
    expect(parseDurationMs('500ms')).toBe(500);
  });

  it('parseDurationMs rejects garbage', () => {
    expect(() => parseDurationMs('soon')).toThrow();
    expect(() => parseDurationMs('10')).toThrow();
  });

  it('randomOtp is always the requested number of digits', () => {
    for (let i = 0; i < 200; i++) expect(randomOtp(6)).toMatch(/^\d{6}$/);
  });

  it('sha256Hex is deterministic hex', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
    expect(sha256Hex('abc')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('randomToken is url-safe and unique', () => {
    const a = randomToken();
    expect(a).not.toBe(randomToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
