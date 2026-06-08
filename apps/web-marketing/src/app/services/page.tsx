import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionTitle } from '@/components/SectionTitle';
import { serviceTracks } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Explore pickup, delivery, and prescription-first digital pharmacy services from Lanyard.',
};

export default function ServicesPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">Services</div>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl">
          Designed around real pharmacy workflows, not just product grids.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-700/80">
          Every service lane is built to feel polished for customers while remaining operationally
          grounded for staff and pharmacists behind the scenes.
        </p>
      </section>

      <section>
        <SectionTitle
          eyebrow="Core lanes"
          title="Three service tracks shape the public-facing story."
          copy="These are the experiences customers should understand before they ever hit checkout."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {serviceTracks.map((service, index) => (
            <article key={service.title} className="surface-card p-7">
              <div className="pill bg-brand-50 text-brand-800">0{index + 1}</div>
              <h2 className="mt-5 font-display text-3xl text-ink-900">{service.title}</h2>
              <p className="mt-4 text-sm leading-7 text-ink-700/80">{service.body}</p>
              <ul className="mt-6 space-y-3 text-sm text-ink-800/80">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-brand-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="mesh-panel rounded-[34px] p-8 text-white shadow-glow">
          <div className="eyebrow text-brand-100">Why this matters</div>
          <h2 className="mt-3 font-display text-4xl">
            The service story should make the brand feel more capable.
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/80">
            A stronger marketing surface does not just look better. It helps customers understand
            pickup options, delivery readiness, prescription verification, and what they can expect
            from each branch.
          </p>
        </article>

        <article className="surface-card p-8">
          <div className="eyebrow">Suggested page system</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              'Pickup service explainer',
              'Prescription-only medicine guidance',
              'Delivery availability by branch',
              'Branch selection and pricing clarity',
            ].map((item) => (
              <div
                key={item}
                className="rounded-[22px] border border-slate-200/70 bg-white/80 px-4 py-4 text-sm font-medium text-ink-800 shadow-card"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link href="/branches" className="cta-secondary">
              See branch experience
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
