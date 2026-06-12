import type { Metadata } from 'next';
import { supportContact } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Privacy Notice',
  description: 'How Lanyard Pharmacy handles customer, order, and prescription information.',
};

const sections = [
  {
    title: 'What we collect',
    body: 'We collect account contact details, selected branch context, cart and order records, delivery information, prescription uploads, and support messages needed to provide pharmacy services.',
  },
  {
    title: 'How we use it',
    body: 'We use this information to verify prescriptions, prepare orders, process payment, coordinate pickup or delivery, provide customer support, and maintain required pharmacy and audit records.',
  },
  {
    title: 'Prescription information',
    body: 'Prescription files are treated as sensitive health information. Access is restricted to authorized pharmacy staff, signed links expire quickly, and access events are recorded for oversight.',
  },
  {
    title: 'Retention and requests',
    body: 'We retain records needed for pharmacy, tax, payment, fraud-prevention, and compliance obligations. Customers can contact support to request correction, access, or deletion where the law allows.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="surface-panel px-6 py-7 sm:px-8">
        <div className="page-eyebrow">NDPA-oriented notice</div>
        <h1 className="page-title mt-3">Privacy and data handling</h1>
        <p className="supporting-copy mt-4">
          Lanyard Pharmacy handles personal and prescription information only for pharmacy care,
          fulfilment, safety, support, and compliance purposes.
        </p>
      </div>

      <div className="grid gap-4">
        {sections.map((section) => (
          <section key={section.title} className="surface-panel px-5 py-5 sm:px-6">
            <h2 className="font-display text-xl text-ink-950">{section.title}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-700/78">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="rx-note">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
          Rx
        </span>
        <p>
          For privacy questions, prescription-file concerns, or data requests, contact support on
          {supportContact.whatsappUrl ? ' WhatsApp' : ' the support channel'}
          {supportContact.phoneHref ? ` or call ${supportContact.phoneDisplay}` : ''}.
        </p>
      </div>
    </div>
  );
}
