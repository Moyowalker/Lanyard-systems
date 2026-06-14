import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionTitle } from '@/components/SectionTitle';
import { serviceTracks } from '@/lib/content';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Delivery, free pickup, and easy prescriptions from a licensed pharmacy near you — see how ordering with Lanyard works.',
};

export default function ServicesPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">How it works</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          Three easy ways to get your medicine.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-900/70">
          Order for fast delivery, reserve for free pickup, or upload a prescription — all from a
          licensed pharmacy near you, with a pharmacist on every prescription.
        </p>
      </section>

      <section>
        <SectionTitle
          eyebrow="What you can do"
          title="Choose what suits you."
          copy="Whether you are in a hurry or planning ahead, there is a simple way to get what you need."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {serviceTracks.map((service, index) => (
            <article key={service.title} className="surface-card p-7">
              <div className="pill bg-brand-50 text-brand-800">0{index + 1}</div>
              <h2 className="mt-5 text-xl font-semibold text-ink-900">{service.title}</h2>
              <p className="mt-3 text-sm leading-7 text-ink-900/75">{service.body}</p>
              <ul className="mt-5 space-y-2.5 text-sm text-ink-900/80">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="mesh-panel rounded-2xl p-8 text-white">
          <div className="eyebrow text-brand-100">Always handled with care</div>
          <h2 className="mt-3 text-3xl font-semibold">
            Genuine medicine, checked before it reaches you.
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/80">
            Every order is grounded in real branch stock, and every prescription is reviewed by a
            licensed pharmacist before it is dispensed — so you can order with confidence.
          </p>
        </article>

        <article className="surface-card p-8">
          <div className="eyebrow">What to expect</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              'Live tracking from order to handoff',
              'Secure payment by card, transfer, or USSD',
              'Switch to a branch near you anytime',
              'Real stock and pricing before you pay',
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-paper-200 bg-paper-50 px-4 py-3.5 text-sm font-medium text-ink-900"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link href="/branches" className="cta-secondary">
              Find a branch near you
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
