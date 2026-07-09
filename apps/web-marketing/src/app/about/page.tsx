import type { Metadata } from 'next';
import { SectionTitle } from '@/components/SectionTitle';
import { StoreLink } from '@/components/StoreLink';
import { principles } from '@/lib/content';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Lanyard Pharmacy makes genuine medicine easy to get across Lagos — fast delivery, free pickup, and a licensed pharmacist on every prescription.',
};

export default function AboutPage() {
  return (
    <div className="space-y-16 pb-16">
      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">About Lanyard</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          Your neighbourhood pharmacy, now a tap away.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-900/70">
          Lanyard exists to make getting the medicine you need simple, safe, and fast — whether you
          want it delivered to your door or ready to collect at a branch near you.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="surface-card p-7 sm:p-8">
          <div className="eyebrow">Our promise</div>
          <h2 className="mt-3 text-2xl font-semibold text-ink-900">
            Genuine medicine, handled by people you can trust.
          </h2>
          <p className="mt-4 text-sm leading-7 text-ink-900/75">
            Every medicine we dispense is NAFDAC-registered and comes through a licensed pharmacy —
            no fakes, no guesswork. Prescription medicines are reviewed by a licensed pharmacist
            before they ever leave the counter.
          </p>
          <p className="mt-4 text-sm leading-7 text-ink-900/75">
            And because your branch matters, you always see real pricing and stock for the location
            nearest you — so the price you see is the price you pay.
          </p>
        </article>

        <article className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,#062f2d,#0f3b39_55%,#0d9488)] p-7 text-white shadow-lift sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.2),transparent_30%)]" />
          <div className="relative">
            <div className="eyebrow text-brand-100">What you can count on</div>
            <div className="mt-6 grid gap-4">
              {[
                ['Genuine medicines', 'NAFDAC-registered and dispensed by a licensed pharmacy.'],
                ['A real pharmacist', 'Every prescription is checked before it is dispensed.'],
                ['Fast and flexible', 'Delivery to your door or free pickup, with live tracking.'],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm"
                >
                  <div className="text-lg font-semibold">{title}</div>
                  <p className="mt-1.5 text-sm leading-7 text-white/80">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section>
        <SectionTitle
          eyebrow="Why Lanyard"
          title="The things that matter when it is your health."
          copy="Genuine medicine, real pharmacists, fair prices, and fast delivery — that is the whole point."
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {principles.map((principle) => (
            <article key={principle.title} className="surface-card hover-lift p-6">
              <h3 className="text-base font-semibold text-ink-900">{principle.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-900/70">{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[28px] border border-brand-100 bg-[linear-gradient(150deg,#f0fdfa,#ffffff_45%,#fffbeb)] p-8 shadow-card">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Ready when you are</div>
            <h2 className="mt-2 text-2xl font-semibold text-ink-900">
              Get your medicines the easy way.
            </h2>
          </div>
          <StoreLink source="about-next-step" className="cta-primary">
            Start shopping
          </StoreLink>
        </div>
      </section>
    </div>
  );
}
