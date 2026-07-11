import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { StoreLink } from '@/components/StoreLink';
import { contactChannels } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Contact Lanyard Pharmacy for help with orders, delivery, pickup, prescriptions, and partnerships.',
};

export default function ContactPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">Contact</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          Need help? Talk to us.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-900/70">
          Questions about an order, delivery, pickup, or a prescription? Our team will help you find
          the next step.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {contactChannels.map((channel) => (
          <article key={channel.title} className="surface-card hover-lift p-6">
            <div className="eyebrow">{channel.title}</div>
            <h2 className="mt-3 text-xl font-semibold text-ink-900">{channel.detail}</h2>
            <p className="mt-3 text-sm leading-7 text-ink-900/70">{channel.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,#062f2d,#0f3b39_55%,#0d9488)] p-8 text-white shadow-lift">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.2),transparent_30%)]" />
          <div className="relative">
            <div className="eyebrow text-brand-100">Talk to a real person</div>
            <h2 className="mt-3 text-3xl font-semibold">We&apos;ll help you figure it out.</h2>
            <p className="mt-4 text-sm leading-7 text-white/80">
              Ask us which branch to use, whether a prescription is needed, or how delivery works in
              your area.
            </p>
          </div>
        </article>

        <ContactForm />
      </section>

      <section className="surface-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow">Common questions</div>
            <h2 className="mt-3 text-2xl font-semibold text-ink-900">
              Quick questions before you order?
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
            'What happens after I send my prescription?',
          ].map((item) => (
            <div
              key={item}
              className="hover-lift rounded-xl border border-paper-200 bg-paper-50 px-4 py-3.5 text-sm font-medium text-ink-900"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
