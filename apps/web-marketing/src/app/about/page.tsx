import type { Metadata } from 'next';
import { SectionTitle } from '@/components/SectionTitle';
import { StoreLink } from '@/components/StoreLink';
import { principles } from '@/lib/content';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why Lanyard Pharmacy separates brand, commerce, and operations into one disciplined system.',
};

export default function AboutPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">About the brand</div>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl">
          The idea is simple: trusted pharmacy care should not feel visually stale.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-700/80">
          Lanyard is designed as a connected system. Marketing creates confidence, the store turns
          that confidence into action, and the admin console supports the regulated work that makes
          the promise credible.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="surface-card p-7 sm:p-8">
          <div className="eyebrow">What the public site should do</div>
          <h2 className="mt-3 font-display text-3xl text-ink-900">
            Set tone, answer doubts, and direct with clarity.
          </h2>
          <p className="mt-4 text-sm leading-7 text-ink-700/80">
            The customer storefront on its own is useful, but it is not enough to build desire or
            brand memory. A dedicated marketing site explains why the business exists, what kind of
            service people can expect, and why the operational rigor matters.
          </p>
          <p className="mt-4 text-sm leading-7 text-ink-700/80">
            That split matters because customers arrive with very different intents. Some want to
            browse immediately. Others need reassurance, branch information, service clarity, or a
            stronger sense of trust before they buy.
          </p>
        </article>

        <article className="mesh-panel rounded-[34px] p-7 text-white shadow-glow sm:p-8">
          <div className="eyebrow text-brand-100">How the surfaces work together</div>
          <div className="mt-6 grid gap-4">
            {[
              ['Marketing', 'Storytelling, credibility, branch discovery, and confidence-building'],
              ['Store', 'Branch-aware browsing, cart, prescription upload, checkout, and tracking'],
              ['Admin', 'Verification, fulfillment, pricing, inventory, and audit-heavy operations'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[24px] bg-white/10 p-5 backdrop-blur-sm">
                <div className="font-display text-2xl">{title}</div>
                <p className="mt-2 text-sm leading-7 text-white/80">{body}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section>
        <SectionTitle
          eyebrow="Principles"
          title="The marketing layer should feel premium because the service promise is high stakes."
          copy="Pharmacy commerce sits at the overlap of health, logistics, trust, and compliance. The visual system should communicate those values with more sophistication than a generic template."
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {principles.map((principle) => (
            <article key={principle.title} className="surface-card p-6">
              <h3 className="font-display text-2xl text-ink-900">{principle.title}</h3>
              <p className="mt-4 text-sm leading-7 text-ink-700/80">{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card flex flex-col gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow">Next step</div>
          <h2 className="mt-2 font-display text-3xl text-ink-900">See the store behind the story.</h2>
        </div>
        <StoreLink source="about-next-step" className="cta-primary">
          Open the storefront
        </StoreLink>
      </section>
    </div>
  );
}
