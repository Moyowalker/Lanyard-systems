import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionTitle } from '@/components/SectionTitle';
import { serviceTracks } from '@/lib/content';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'See how to order genuine medicines from Lanyard Pharmacy for delivery, free pickup, or prescription support.',
};

export default function ServicesPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">How it works</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          Get your medicine without the stress.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-900/70">
          Order for delivery, reserve for pickup, or send your prescription for a licensed
          pharmacist to check.
        </p>
      </section>

      <section>
        <SectionTitle
          eyebrow="What you can do"
          title="Choose the option that works for you."
          copy="Whether you need it now or later today, Lanyard keeps the steps simple."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {serviceTracks.map((service, index) => (
            <article
              key={service.title}
              className={`hover-lift rounded-2xl border p-7 shadow-card ${
                index === 0
                  ? 'border-brand-100 bg-gradient-to-b from-brand-50/80 to-white'
                  : index === 2
                    ? 'border-seal-200 bg-gradient-to-b from-seal-50/80 to-white'
                    : 'border-paper-200 bg-white'
              }`}
            >
              <div
                className={`pill ${index === 2 ? 'bg-seal-100 text-ink-900' : 'bg-brand-50 text-brand-800'}`}
              >
                0{index + 1}
              </div>
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
        <article className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,#062f2d,#0f3b39_55%,#0d9488)] p-8 text-white shadow-lift">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.2),transparent_30%)]" />
          <div className="relative">
            <div className="eyebrow text-brand-100">Always handled with care</div>
            <h2 className="mt-3 text-3xl font-semibold">
              Genuine medicine, checked before it reaches you.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/80">
              We show real branch stock and clear prices. If a medicine needs a prescription, a
              licensed pharmacist checks it before we prepare the order.
            </p>
          </div>
        </article>

        <article className="surface-card p-8">
          <div className="eyebrow">What to expect</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              'Updates from order to delivery',
              'Secure payment by card, transfer, or USSD',
              'Switch to a branch near you anytime',
              'Real stock and pricing before you pay',
            ].map((item) => (
              <div
                key={item}
                className="hover-lift rounded-xl border border-paper-200 bg-paper-50 px-4 py-3.5 text-sm font-medium text-ink-900"
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
