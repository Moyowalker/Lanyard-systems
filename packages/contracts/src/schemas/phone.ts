import { z } from 'zod';

/**
 * Shared phone handling. Storage stays strictly E.164 everywhere — this normalizes at the
 * edge so the strict Mongoose `match:` never sees a value a human would consider valid.
 *
 * Previously every form demanded a leading `+`, so a pharmacy typing a perfectly ordinary
 * `0803 123 4567` was rejected with no way to tell what was wrong. That is what this fixes;
 * it is NOT a relaxation of the stored format.
 */

/** E.164: leading `+`, no zero after it, 7–15 digits total. Any country, not just Nigeria. */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Default country used to expand local numbers. Nigeria — the only market today. */
const DEFAULT_DIAL_CODE = '234';

/**
 * Coerce common human formats to E.164 before validation:
 *   "0803 123 4567" / "0803-123-4567" / "(0803)1234567" → "+2348031234567"
 *   "2348031234567"                                     → "+2348031234567"
 *   "+44 20 7946 0958"                                  → "+442079460958"
 * Anything already E.164 passes through untouched, and other country codes are preserved.
 * Non-strings and blanks are returned unchanged/undefined so `.optional()` still works.
 */
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const stripped = value.replace(/[\s\-().]/g, '');
  if (stripped === '') return undefined;

  // Already international.
  if (stripped.startsWith('+')) return stripped;

  // Local trunk form: 0 followed by the subscriber number.
  if (/^0\d{7,14}$/.test(stripped)) return `+${DEFAULT_DIAL_CODE}${stripped.slice(1)}`;

  // Dial code typed without the plus.
  if (/^\d{7,15}$/.test(stripped)) return `+${stripped}`;

  // Anything else is left alone so validation reports it rather than mangling it.
  return stripped;
}

/**
 * Reusable optional phone field: normalizes, then enforces E.164.
 * Use this instead of hand-rolling the regex — seven independent copies of it had already
 * drifted across the codebase.
 */
export const optionalPhoneSchema = z.preprocess(
  normalizePhone,
  z.string().regex(E164_PATTERN, 'must be a valid phone number, e.g. 08031234567').optional(),
);

/** Required variant, same normalization. */
export const phoneSchema = z.preprocess(
  normalizePhone,
  z.string().regex(E164_PATTERN, 'must be a valid phone number, e.g. 08031234567'),
);
