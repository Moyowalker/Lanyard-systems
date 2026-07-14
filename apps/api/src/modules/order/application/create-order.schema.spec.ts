import { CreateOrderSchema, FulfillmentType } from '@lanyard/contracts';

/** Checkout regression: legacy/localized phone formats must not 500 the delivery path. */
describe('CreateOrderSchema contactPhone normalization', () => {
  function parse(contactPhone?: string) {
    return CreateOrderSchema.safeParse({
      fulfillment: {
        type: FulfillmentType.DELIVERY,
        deliveryZoneName: 'Ago Palace',
        deliveryNote: '  Call on arrival  ',
        address: { line1: '86 Ago Palace Way', city: 'Lagos', state: 'Lagos', contactPhone },
      },
    });
  }

  it('accepts a clean E.164 number unchanged', () => {
    const res = parse('+2348012345678');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.fulfillment.address?.contactPhone).toBe('+2348012345678');
      expect(res.data.fulfillment.deliveryNote).toBe('Call on arrival');
    }
  });

  it('strips spaces/dashes and converts local 0-prefix to +234', () => {
    const res = parse('0801 234-5678');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.fulfillment.address?.contactPhone).toBe('+2348012345678');
    }
  });

  it('treats an empty string as absent instead of failing', () => {
    const res = parse('');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.fulfillment.address?.contactPhone).toBeUndefined();
    }
  });

  it('rejects an unfixable phone with a 400-level validation error, never a 500', () => {
    const res = parse('not-a-phone');
    expect(res.success).toBe(false);
  });

  it('caps the delivery note at 500 chars', () => {
    const res = CreateOrderSchema.safeParse({
      fulfillment: { type: FulfillmentType.PICKUP, deliveryNote: 'x'.repeat(501) },
    });
    expect(res.success).toBe(false);
  });
});
