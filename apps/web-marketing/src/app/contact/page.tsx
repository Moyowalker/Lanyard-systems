import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { StoreLink } from '@/components/StoreLink';
import { contactChannels } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Find the best way to reach Lanyard Pharmacy for care, service, and partnership enquiries.',
};

export default function ContactPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">Contact</div>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl">
          A contact page should feel calm, direct, and ready to guide the next step.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-700/80">
          Even when contact details are simple in a local demo, the page should still feel like a
          premium support surface rather than an afterthought.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {contactChannels.map((channel) => (
          <article key={channel.title} className="surface-card p-6">
            <div className="eyebrow">{channel.title}</div>
            <h2 className="mt-3 font-display text-3xl text-ink-900">{channel.detail}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-700/80">{channel.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article className="mesh-panel rounded-[34px] p-8 text-white shadow-glow">
          <div className="eyebrow text-brand-100">When people reach out</div>
          <h2 className="mt-3 font-display text-4xl">
            The response should feel informed, not generic.
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/80">
            Good pharmacy communication is reassurance plus clarity: what branch to use, whether a
            prescription is needed, and what to expect next.
          </p>
        </article>

        <ContactForm />
      </section>

      <section className="surface-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow">Useful prompts</div>
            <h2 className="mt-3 font-display text-3xl text-ink-900">
              Ask the questions that usually block an order.
            </h2>
          </div>
          <StoreLink source="contact-store-handoff" className="cta-secondary">
            Open customer store
          </StoreLink>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Which branch is best for this order?',
            'Can this medicine be ordered without a prescription?',
            'Does this branch currently support delivery?',
            'What happens after I upload a prescription?',
          ].map((item) => (
            <div
              key={item}
              className="rounded-[22px] border border-slate-200/70 bg-white/80 px-4 py-4 text-sm font-medium text-ink-800 shadow-card"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
