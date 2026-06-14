import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { StoreLink } from '@/components/StoreLink';
import { contactChannels } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Reach Lanyard Pharmacy for order help, branch guidance, prescriptions, and partnership enquiries.',
};

export default function ContactPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">Contact</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          We&apos;re here to help.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-900/70">
          Questions about an order, a branch, or a prescription? Reach a real person on the Lanyard
          care team — we&apos;ll point you to the right branch and the next step.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {contactChannels.map((channel) => (
          <article key={channel.title} className="surface-card p-6">
            <div className="eyebrow">{channel.title}</div>
            <h2 className="mt-3 text-xl font-semibold text-ink-900">{channel.detail}</h2>
            <p className="mt-3 text-sm leading-7 text-ink-900/70">{channel.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="mesh-panel rounded-2xl p-8 text-white">
          <div className="eyebrow text-brand-100">Talk to a real person</div>
          <h2 className="mt-3 text-3xl font-semibold">Care that answers, clearly.</h2>
          <p className="mt-4 text-sm leading-7 text-white/80">
            Our team helps with the things that matter before you order: which branch to use,
            whether you need a prescription, delivery times, and what happens next.
          </p>
        </article>

        <ContactForm />
      </section>

      <section className="surface-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow">Common questions</div>
            <h2 className="mt-3 text-2xl font-semibold text-ink-900">
              Quick answers before you order.
            </h2>
          </div>
          <StoreLink source="contact-store-handoff" className="cta-secondary">
            Start shopping
          </StoreLink>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Which branch is best for my order?',
            'Can I get this without a prescription?',
            'Do you deliver to my area?',
            'What happens after I upload a prescription?',
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-paper-200 bg-paper-50 px-4 py-3.5 text-sm font-medium text-ink-900"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
