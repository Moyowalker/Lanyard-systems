'use client';

import type { OrderDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { statusLabel, statusTone } from '@/lib/orders';
import { supportContact } from '@/lib/support';

type OrderNextStepProps = {
  order: OrderDto;
  needsInfo?: boolean;
  paying?: boolean;
  payStep?: string;
  payError?: string;
  onPayNow: () => void;
};

function nextStepCopy(order: OrderDto, needsInfo?: boolean) {
  if (needsInfo) {
    return {
      title: 'Pharmacist needs more information',
      body: 'Upload the requested prescription details below so the pharmacist can continue reviewing this order.',
      tone: 'attention',
    };
  }

  switch (order.status) {
    case 'AWAITING_RX_VERIFICATION':
      return {
        title: 'Prescription review is next',
        body: 'A licensed pharmacist is checking your prescription. Once it is verified, payment can be completed and fulfilment can begin.',
        tone: 'checking',
      };
    case 'AWAITING_PAYMENT':
      return {
        title: 'Payment is the next step',
        body: order.requiresRxVerification
          ? 'Your prescription is verified. Complete payment when ready so the branch can start preparing your order.'
          : 'Your order is saved. Complete payment when ready so the branch can start preparing it.',
        tone: 'action',
      };
    case 'PAYMENT_FAILED':
      return {
        title: 'Payment did not complete',
        body: 'Your order is still saved. Try payment again, or contact support if the charge is unclear.',
        tone: 'attention',
      };
    case 'STOCK_HOLD':
      return {
        title: 'Stock review in progress',
        body: 'The branch is resolving availability before fulfilment continues. We will update this page when the order moves forward.',
        tone: 'attention',
      };
    case 'PAID':
      return {
        title: 'Payment received',
        body: 'The branch has your paid order and will begin fulfilment shortly.',
        tone: 'good',
      };
    case 'FULFILLING':
      return {
        title: 'Order is being prepared',
        body: 'The branch is picking and checking your medicines now.',
        tone: 'good',
      };
    case 'READY_FOR_PICKUP':
      return {
        title: 'Ready for pickup',
        body: 'Your order is ready at the branch. Bring your order details when you arrive.',
        tone: 'good',
      };
    case 'OUT_FOR_DELIVERY':
      return {
        title: 'Out for delivery',
        body: order.fulfillment.etaMins
          ? `Your order is on the way. Estimated delivery is about ${order.fulfillment.etaMins} minutes.`
          : 'Your order is on the way. Delivery updates will appear here.',
        tone: 'good',
      };
    case 'COMPLETED':
      return {
        title: 'Order completed',
        body: 'Thanks for choosing Lanyard Pharmacy. You can reorder these medicines from this order whenever needed.',
        tone: 'complete',
      };
    case 'RX_REJECTED':
      return {
        title: 'Prescription was not approved',
        body: 'The pharmacist could not approve this prescription. Contact support or place a new order with updated prescription details.',
        tone: 'attention',
      };
    case 'CANCELLED':
      return {
        title: 'Order cancelled',
        body: 'This order is no longer active. You can reorder available items from this order if you still need them.',
        tone: 'complete',
      };
    case 'REFUNDED':
      return {
        title: 'Order refunded',
        body: 'A refund has been recorded for this order. Contact support if you need more details.',
        tone: 'complete',
      };
    default:
      return {
        title: statusLabel(order.status),
        body: 'We will keep this page updated as your order moves forward.',
        tone: 'checking',
      };
  }
}

export function OrderNextStep({
  order,
  needsInfo,
  paying = false,
  payStep,
  payError,
  onPayNow,
}: OrderNextStepProps) {
  const copy = nextStepCopy(order, needsInfo);
  const canPay = order.status === 'AWAITING_PAYMENT' || order.status === 'PAYMENT_FAILED';
  const supportHref = supportContact.whatsappUrl || supportContact.phoneHref || '/account/profile';

  return (
    <section className="surface-panel border-2 border-brand-100 px-5 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="section-kicker before:hidden">What happens next</div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(order.status)}`}
            >
              {statusLabel(order.status)}
            </span>
          </div>
          <h2 className="mt-3 font-display text-xl text-ink-950">{copy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-700/78">{copy.body}</p>
          {order.fulfillment.type === 'delivery' && order.fulfillment.deliveryZoneName ? (
            <p className="mt-2 text-xs font-medium text-ink-700/60">
              Delivery zone: {order.fulfillment.deliveryZoneName}
              {order.fulfillment.etaMins ? ` · about ${order.fulfillment.etaMins} min` : ''}
            </p>
          ) : null}
          {payError ? (
            <p className="mt-4 rounded-[1rem] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {payError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:min-w-40">
          {canPay ? (
            <>
              <div className="tnum text-right font-display text-2xl text-ink-950">
                {formatKobo(order.totals.totalKobo)}
              </div>
              <button onClick={onPayNow} disabled={paying} className="primary-button">
                {paying ? payStep || 'Working...' : 'Continue payment'}
              </button>
            </>
          ) : null}
          {copy.tone === 'attention' ? (
            <a
              href={supportHref}
              className="secondary-button min-h-0 justify-center px-3 py-2 text-xs"
            >
              Contact support
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
