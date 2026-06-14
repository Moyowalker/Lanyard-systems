import { DeliveryStatus, OrderStatus } from '@lanyard/contracts';
import { mapDeliveryAction } from './delivery.service';

describe('mapDeliveryAction', () => {
  it('out_for_delivery drives the order to OUT_FOR_DELIVERY', () => {
    expect(mapDeliveryAction('out_for_delivery')).toEqual({
      deliveryStatus: DeliveryStatus.OUT_FOR_DELIVERY,
      orderTarget: OrderStatus.OUT_FOR_DELIVERY,
    });
  });

  it('delivered completes the order (reusing the dispense path)', () => {
    expect(mapDeliveryAction('delivered')).toEqual({
      deliveryStatus: DeliveryStatus.DELIVERED,
      orderTarget: OrderStatus.COMPLETED,
    });
  });

  it('failed does NOT move the order (staff can re-dispatch)', () => {
    expect(mapDeliveryAction('failed')).toEqual({
      deliveryStatus: DeliveryStatus.FAILED,
      orderTarget: null,
    });
  });
});
