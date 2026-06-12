import type { Metadata } from 'next';
import { supportContact } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Returns and Refunds',
  description: 'Return and refund guidance for Lanyard Pharmacy orders.',
};

const policies = [
  {
    title: 'Before dispensing',
    body: 'Orders that have not yet been dispensed can usually be cancelled by support. If payment has already been made, the refund is handled back to the original payment route after review.',
  },
  {
    title: 'Prescription medicines',
    body: 'For safety and regulatory reasons, dispensed prescription medicines cannot usually be returned unless the branch made an error, the product is damaged, or the law requires a remedy.',
  },
  {
    title: 'OTC and wellness items',
    body: 'Unopened, eligible non-prescription items may be reviewed for return if reported promptly with the order number, product condition, and branch handoff details.',
  },
  {
    title: 'Damaged or incorrect items',
    body: 'Contact support as soon as possible with photos and your order number. The pharmacy team will review the issue and arrange replacement, correction, or refund where appropriate.',
  },
];

export default function ReturnsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="surface-panel px-6 py-7 sm:px-8">
        <div className="page-eyebrow">Order support</div>
        <h1 className="page-title mt-3">Returns and refunds</h1>
        <p className="supporting-copy mt-4">
          Pharmacy returns must protect patient safety. Support can review order issues, payment
          refunds, damaged items, and branch handoff concerns.
        </p>
      </div>

      <div className="grid gap-4">
        {policies.map((policy) => (
          <section key={policy.title} className="surface-panel px-5 py-5 sm:px-6">
            <h2 className="font-display text-xl text-ink-950">{policy.title}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-700/78">{policy.body}</p>
          </section>
        ))}
      </div>

      <div className="surface-panel px-5 py-5 sm:px-6">
        <div className="section-kicker">Fastest support route</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {supportContact.whatsappUrl ? (
            <a href={supportContact.whatsappUrl} className="primary-button">
              WhatsApp support
            </a>
          ) : null}
          {supportContact.phoneHref ? (
            <a href={supportContact.phoneHref} className="secondary-button">
              Call {supportContact.phoneDisplay}
            </a>
          ) : null}
          {!supportContact.whatsappUrl && !supportContact.phoneHref ? (
            <span className="secondary-button">{supportContact.hours}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
