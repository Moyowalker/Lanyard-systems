import Link from 'next/link';
import { BranchGrid } from '@/components/BranchGrid';
import { SectionTitle } from '@/components/SectionTitle';
import { StoreLink } from '@/components/StoreLink';
import { getMarketingBranches } from '@/lib/branches';
import { faqs, heroStats, principles, serviceTracks } from '@/lib/content';
import { branchListJsonLd, marketingOrganizationJsonLd } from '@/lib/seo';

export const revalidate = 300;

const benefits = [
  { icon: 'truck', title: 'Fast delivery', sub: '~60 min across Lagos' },
  { icon: 'shield', title: 'Pharmacist-checked', sub: 'every prescription' },
  { icon: 'seal', title: 'Genuine medicines', sub: 'NAFDAC-registered' },
  { icon: 'store', title: 'Pickup or delivery', sub: 'your choice' },
] as const;

const steps = [
  { n: '1', title: 'Search or upload', body: 'Find your medicine, or upload a prescription.' },
  { n: '2', title: 'Pharmacist verifies', body: 'A licensed pharmacist checks every prescription.' },
  { n: '3', title: 'Delivery or pickup', body: 'Get it brought to you, or collect at your branch.' },
] as const;

function Icon({ name, className }: { name: string; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const;
  if (name === 'truck')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" strokeLinejoin="round" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17.5" cy="18" r="1.6" />
      </svg>
    );
  if (name === 'shield')
    return (
      <svg {...common} aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Zm-2.5 9 1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === 'seal')
    return (
      <svg {...common} aria-hidden="true">
        <path d="m12 3 2.2 1.6 2.7-.2 1 2.5 2.3 1.4-.7 2.6.7 2.6-2.3 1.4-1 2.5-2.7-.2L12 21l-2.2-1.6-2.7.2-1-2.5-2.3-1.4.7-2.6-.7-2.6 2.3-1.4 1-2.5 2.7.2Z" strokeLinejoin="round" />
        <path d="m9.5 12 1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden="true">
      <path d="M4 9h16l-1-5H5L4 9Zm0 0v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" strokeLinejoin="round" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export default async function HomePage() {
  const { items: branches, isLive } = await getMarketingBranches();
  const branchCount = branches.length;

  return (
    <div className="space-y-16 pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingOrganizationJsonLd(branches)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(branchListJsonLd(branches)) }}
      />

      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="eyebrow">Lagos&apos; trusted online pharmacy</div>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.01em] text-ink-900 sm:text-5xl">
            Genuine medicines, delivered to your door.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-ink-900/70">
            Order from a real licensed pharmacy near you — delivered in about an hour, or ready for
            pickup. Every prescription is checked by a pharmacist before it reaches you.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <StoreLink source="home-hero-shop" className="cta-primary">
              Start shopping
            </StoreLink>
            <StoreLink source="home-hero-rx" intent="prescription" className="cta-secondary">
              Upload a prescription
            </StoreLink>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-900/65">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="seal" className="h-4 w-4 text-brand-600" /> NAFDAC-registered
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="shield" className="h-4 w-4 text-brand-600" /> Licensed pharmacists
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="store" className="h-4 w-4 text-brand-600" /> {branchCount}{' '}
              {branchCount === 1 ? 'branch' : 'branches'} in Lagos
            </span>
          </div>
        </div>

        {/* Hero image slot (drop a real photo here) */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-paper-200 bg-brand-50">
          <div className="flex h-full w-full items-center justify-center">
            <Icon name="seal" className="h-16 w-16 text-brand-300" />
          </div>
          <div className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon name="truck" className="h-5 w-5" />
            </span>
            <span className="text-sm leading-tight">
              <span className="block font-semibold text-ink-900">Delivered in ~60 min</span>
              <span className="block text-xs text-ink-900/55">to your door across Lagos</span>
            </span>
          </div>
        </div>
      </section>

      {/* Benefit strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map((b) => (
          <div key={b.title} className="surface-card flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon name={b.icon} className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-ink-900">{b.title}</span>
              <span className="block text-xs text-ink-900/55">{b.sub}</span>
            </span>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section>
        <SectionTitle
          eyebrow="How it works"
          title="From your phone to your hands in three simple steps."
          copy="No queues, no guesswork — just genuine medicine, handled with care."
        />
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="surface-card p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-900/70">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section>
        <SectionTitle
          eyebrow="What you get"
          title="Delivery, pickup, and prescriptions — handled properly."
          copy="Everything is grounded in a real branch near you, with a licensed pharmacist on every prescription."
          action={
            <Link href="/services" className="cta-secondary">
              See how it works
            </Link>
          }
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {serviceTracks.map((service) => (
            <article key={service.title} className="surface-card p-6">
              <h3 className="text-lg font-semibold text-ink-900">{service.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-900/70">{service.body}</p>
              <ul className="mt-5 space-y-2.5 text-sm text-ink-900/80">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2.5">
                    <Icon name="shield" className="mt-0.5 h-4 w-4 flex-none text-brand-600" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Why Lanyard */}
      <section>
        <SectionTitle
          eyebrow="Why Lanyard"
          title="A pharmacy you can actually trust online."
          copy="Genuine medicine, real pharmacists, fair prices, and fast delivery — the things that matter when it is your health."
        />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {principles.map((principle) => (
            <article key={principle.title} className="surface-card p-6">
              <h3 className="text-base font-semibold text-ink-900">{principle.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-900/70">{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Branches */}
      <section>
        <SectionTitle
          eyebrow="Find a branch"
          title="A trusted pharmacy near you in Lagos."
          copy="Choose your branch to see real pricing and stock — then shop for delivery or pickup."
          action={
            <Link href="/branches" className="cta-secondary">
              View all branches
            </Link>
          }
        />
        <BranchGrid branches={branches} isLive={isLive} />
      </section>

      {/* FAQ */}
      <section>
        <SectionTitle
          eyebrow="Questions, answered"
          title="Everything you need to know before you order."
          copy="Prescriptions, delivery, pricing, and payment — the common questions, answered simply."
          action={
            <Link href="/faq" className="cta-secondary">
              Read all FAQs
            </Link>
          }
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {faqs.slice(0, 3).map((faq) => (
            <article key={faq.question} className="surface-card p-6">
              <h3 className="text-base font-semibold text-ink-900">{faq.question}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-900/70">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mesh-panel overflow-hidden rounded-2xl p-8 text-white sm:p-10">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-100">
            Ready when you are
          </div>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Your medicines, the easy way.
          </h2>
          <p className="mt-4 text-base leading-8 text-white/80">
            Browse, order, and get genuine medicine delivered — or pick it up at your branch. Every
            prescription is checked by a licensed pharmacist.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <StoreLink
              source="home-final-shop"
              className="cta-primary bg-white text-ink-900 hover:bg-brand-50"
            >
              Start shopping
            </StoreLink>
            <Link
              href="/contact"
              className="cta-secondary border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
