import {
  CreateBranchSchema,
  CreateStaffSchema,
  CreateVendorSchema,
  normalizePhone,
  optionalPhoneSchema,
} from '@lanyard/contracts';

/**
 * Regression: every admin form demanded a leading `+`, so an ordinary Nigerian number typed
 * as `0803…` was rejected with no hint as to why. Storage stays strict E.164 — these assert
 * the coercion that now happens before validation.
 */
describe('phone normalization', () => {
  describe('normalizePhone', () => {
    it.each([
      ['local, spaced', '0803 123 4567', '+2348031234567'],
      ['local, dashed', '0803-123-4567', '+2348031234567'],
      ['local, bracketed', '(0803)123.4567', '+2348031234567'],
      ['local, plain', '08031234567', '+2348031234567'],
      ['dial code without plus', '2348031234567', '+2348031234567'],
      ['already E.164', '+2348031234567', '+2348031234567'],
      ['other country preserved', '+44 20 7946 0958', '+442079460958'],
    ])('%s → E.164', (_label, input, expected) => {
      expect(normalizePhone(input)).toBe(expected);
    });

    it('treats blank and whitespace as absent', () => {
      expect(normalizePhone('')).toBeUndefined();
      expect(normalizePhone('   ')).toBeUndefined();
    });

    it('passes non-strings through untouched', () => {
      expect(normalizePhone(undefined)).toBeUndefined();
      expect(normalizePhone(null)).toBeNull();
    });
  });

  describe('optionalPhoneSchema', () => {
    it('accepts a local number and stores it as E.164', () => {
      const res = optionalPhoneSchema.safeParse('0803 123 4567');
      expect(res.success).toBe(true);
      if (res.success) expect(res.data).toBe('+2348031234567');
    });

    it('accepts a non-Nigerian number', () => {
      expect(optionalPhoneSchema.safeParse('+442079460958').success).toBe(true);
    });

    it.each([
      ['letters', 'not-a-phone'],
      ['too short', '123'],
    ])('still rejects %s', (_label, input) => {
      expect(optionalPhoneSchema.safeParse(input).success).toBe(false);
    });
  });

  // The branch contact phone is the field that originally surfaced the bug: it had no
  // contract-level check at all, so the failure only appeared at the Mongoose layer.
  it('normalizes the branch contact phone', () => {
    const res = CreateBranchSchema.safeParse({
      code: 'LAG-AGO-01',
      name: 'Ago Palace',
      address: { line1: '86 Ago Palace Way', city: 'Lagos', state: 'Lagos', lat: 6.5, lng: 3.3 },
      contact: { phone: '0803 123 4567' },
      superintendentStaffId: 'a'.repeat(24),
      pcnPremisesNo: 'PCN-1',
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.contact?.phone).toBe('+2348031234567');
  });

  it('normalizes the staff phone', () => {
    const res = CreateStaffSchema.safeParse({
      email: 'ada@lanyard.test',
      firstName: 'Ada',
      lastName: 'Okeke',
      phone: '08031234567',
      password: 'a-long-enough-password',
      roleIds: ['b'.repeat(24)],
      branchScope: ['ALL'],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.phone).toBe('+2348031234567');
  });

  it('normalizes the vendor phone', () => {
    const res = CreateVendorSchema.safeParse({ name: 'Emzor', phone: '0803-123-4567' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.phone).toBe('+2348031234567');
  });
});
