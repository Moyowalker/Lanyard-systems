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
  {
    n: '1',
    title: 'Search or upload',
    body: 'Find your medicine or send your prescription in a few taps.',
  },
  {
    n: '2',
    title: 'Pick a nearby branch',
    body: 'We show branches with stock, clear prices, and delivery or pickup options.',
  },
  {
    n: '3',
    title: 'Delivery or pickup',
    body: 'Get your medicine delivered, or pick it up when your branch has it ready.',
  },
] as const;

const featuredMedicines = [
  {
    name: 'Paracetamol 500mg',
    meta: 'Pain relief · OTC',
    price: 'From NGN 2,200',
    chips: ['Fast-moving', 'In stock'],
    tone: 'brand',
  },
  {
    name: 'Vitamin C 1000mg',
    meta: 'Daily wellness · OTC',
    price: 'From NGN 4,500',
    chips: ['Wellness', 'Popular'],
    tone: 'paper',
  },
  {
    name: 'ORS Sachets',
    meta: 'Hydration support · In stock',
    price: 'From NGN 1,200',
    chips: ['Everyday care', 'Quick pickup'],
    tone: 'paper',
  },
  {
    name: 'Amoxicillin 500mg',
    meta: 'Prescription medicine',
    price: 'Pharmacist review',
    chips: ['Prescription', 'Verified'],
    tone: 'seal',
  },
] as const;

function Icon({ name, className }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
  } as const;
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
        <path
          d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Zm-2.5 9 1.8 1.8L15 10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (name === 'seal')
    return (
      <svg {...common} aria-hidden="true">
        <path
          d="m12 3 2.2 1.6 2.7-.2 1 2.5 2.3 1.4-.7 2.6.7 2.6-2.3 1.4-1 2.5-2.7-.2L12 21l-2.2-1.6-2.7.2-1-2.5-2.3-1.4.7-2.6-.7-2.6 2.3-1.4 1-2.5 2.7.2Z"
          strokeLinejoin="round"
        />
        <path d="m9.5 12 1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden="true">
      <path
        d="M4 9h16l-1-5H5L4 9Zm0 0v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"
        strokeLinejoin="round"
      />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export default async function HomePage() {
  const { items: branches, isLive } = await getMarketingBranches();
  const branchCount = branches.length;

  return (
    <div className="-mt-4 space-y-12 pb-10 sm:mt-0 sm:space-y-16 sm:pb-12 [&>section:first-of-type]:!mt-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingOrganizationJsonLd(branches)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(branchListJsonLd(branches)) }}
      />

      {/* Hero */}
      <section className="grid items-start gap-5 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8">
        <div className="order-1 lg:order-1 rise-in">
          <div className="eyebrow">Lagos&apos; trusted online pharmacy</div>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.01em] text-ink-900 sm:text-5xl">
            Your <span className="text-gradient">Trusted Neighbourhood Pharmacy</span> Online
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-ink-900/70 sm:text-lg sm:leading-8">
            Order from a licensed Lanyard branch. Choose delivery, free pickup, or send your
            prescription for a pharmacist to check.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StoreLink source="home-hero-shop" className="cta-primary">
              Start shopping
            </StoreLink>
            <StoreLink source="home-hero-rx" intent="prescription" className="cta-secondary">
              Upload a prescription
            </StoreLink>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-900/65">
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

        <div className="order-2 relative overflow-hidden rounded-2xl border border-paper-200 bg-[#eefcf8] p-3 shadow-lift sm:p-5 lg:order-2 lg:min-h-[460px] rise-in">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(13,148,136,0.16),transparent_38%),radial-gradient(circle_at_78%_16%,rgba(0,105,217,0.14),transparent_26%),radial-gradient(circle_at_20%_90%,rgba(20,184,166,0.18),transparent_30%)]" />

          <div className="relative flex h-full flex-col gap-3.5 sm:gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-xs font-semibold text-brand-800 shadow-card backdrop-blur">
                Live branch stock
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-xs font-semibold text-ink-900/70 shadow-card backdrop-blur">
                <Icon name="seal" className="h-4 w-4 text-brand-600" /> Pharmacist checked
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {heroStats.map((stat) => (
                <div
                  key={stat.value}
                  className="rounded-xl border border-white/80 bg-white/85 px-3 py-2 shadow-card backdrop-blur"
                >
                  <div className="text-base font-semibold text-ink-900">{stat.value}</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-ink-900/55">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_0.75fr] lg:gap-4">
              <div className="rounded-2xl border border-paper-200 bg-white p-4 shadow-card sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
                      Shop essentials
                    </div>
                    <h2 className="mt-2 text-xl font-semibold leading-tight text-ink-900">
                      See medicines first
                    </h2>
                  </div>
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon name="shield" className="h-6 w-6" />
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {featuredMedicines.slice(0, 3).map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center gap-3 rounded-xl border border-paper-200 bg-paper-50 px-3 py-2.5"
                    >
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white text-brand-700">
                        <Icon name="seal" className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink-900">
                          {item.name}
                        </span>
                        <span className="block truncate text-xs text-ink-900/55">{item.meta}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="animate-float-soft rounded-2xl border border-white/80 bg-ink-900 p-4 text-white shadow-lift">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-100">
                    <Icon name="store" className="h-4 w-4" /> Branch ready
                  </div>
                  <div className="mt-3 text-3xl font-semibold leading-none">98%</div>
                  <div className="mt-1 text-xs leading-5 text-white/65">
                    common essentials available for same-day delivery or pickup.
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-xl border border-paper-200 bg-white px-3.5 py-3 shadow-card">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon name="truck" className="h-5 w-5" />
                  </span>
                  <span className="text-sm leading-tight">
                    <span className="block font-semibold text-ink-900">Delivered in ~60 min</span>
                    <span className="block text-xs text-ink-900/55">to your door across Lagos</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[28px] border border-brand-100 bg-[linear-gradient(150deg,#f0fdfa,#ffffff_45%,#fffbeb)] p-4 shadow-card sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(13,148,136,0.1),transparent_32%),radial-gradient(circle_at_8%_92%,rgba(245,158,11,0.08),transparent_30%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Start with the drugs</div>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-ink-900 sm:text-3xl">
              Find what you need quickly.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-900/70 sm:text-base sm:leading-7">
              We put medicines and everyday categories up front, so you can start shopping without
              digging around.
            </p>
          </div>
          <StoreLink source="home-featured-shop" className="cta-secondary">
            Open full catalogue
          </StoreLink>
        </div>

        <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {featuredMedicines.map((item) => (
            <article
              key={item.name}
              className={`hover-lift rounded-2xl border p-4 shadow-card ${
                item.tone === 'brand'
                  ? 'border-brand-100 bg-brand-50/70'
                  : item.tone === 'seal'
                    ? 'border-seal-200 bg-seal-50/70'
                    : 'border-paper-200 bg-white'
              }`}
            >
              <div className="rounded-2xl border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(255,255,255,0.65)_58%,rgba(13,148,136,0.12))] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="block text-sm font-semibold text-ink-900">{item.name}</span>
                    <span className="mt-1 block text-xs text-ink-900/55">{item.meta}</span>
                  </div>
                  <span className="rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">
                    View
                  </span>
                </div>
                <div className="mt-4 flex h-28 items-end rounded-[1.25rem] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(230,248,245,0.88))] p-3">
                  <div className="flex items-end gap-2">
                    <span className="h-16 w-12 rounded-t-[1rem] rounded-b-md bg-brand-200/90 shadow-sm" />
                    <span className="h-20 w-14 rounded-t-[1rem] rounded-b-md bg-white shadow-sm" />
                    <span className="h-12 w-10 rounded-t-[0.9rem] rounded-b-md bg-seal-200/90 shadow-sm" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-ink-900/65"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink-900">{item.price}</span>
                <StoreLink
                  source={`featured-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  className="inline-flex text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
                >
                  Shop now
                </StoreLink>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          'Pain relief',
          'Cold & flu',
          'Vitamins',
          'Prescription refill',
          'Baby care',
          'Stomach care',
        ].map((chip) => (
          <StoreLink
            key={chip}
            source={`chip-${chip.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            className="surface-card hover-lift flex items-center justify-between px-4 py-3 text-sm font-semibold text-ink-900 transition-colors hover:border-brand-200 hover:bg-brand-50"
          >
            <span>{chip}</span>
            <span className="text-brand-700">+</span>
          </StoreLink>
        ))}
      </section>

      {/* Benefit strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map((b) => (
          <div key={b.title} className="surface-card hover-lift flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700">
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
          title={
            <>
              See what happens after you <span className="text-gradient">place an order</span>.
            </>
          }
          copy="Simple steps, clear updates, and pharmacist checks where they matter."
        />
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          {/* Smart assistant simulation */}
          <div className="relative overflow-hidden rounded-[28px] border border-paper-200 bg-[linear-gradient(160deg,#062f2d,#0d4f4b_60%,#0a6d66)] p-5 text-white shadow-lift sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(244,196,48,0.16),transparent_24%)]" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-100">
                  <span className="pulse-ring h-2 w-2 rounded-full bg-brand-300" />
                  Lanyard order help
                </div>
                <span className="text-[11px] font-medium text-white/50">live demo</span>
              </div>

              <div className="mt-5 space-y-3">
                {/* customer message */}
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500/90 px-4 py-2.5 text-sm shadow-sm">
                  I need Paracetamol and my blood pressure refill.
                </div>

                {/* assistant response */}
                <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-3 text-sm backdrop-blur-sm">
                  <span className="shimmer-text font-semibold">
                    Both are available at Ago Palace
                  </span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-6 rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                      <span>Paracetamol 500mg</span>
                      <span className="font-semibold text-brand-200">In stock</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                      <span>Amlodipine 5mg</span>
                      <span className="font-semibold text-seal-300">Prescription check</span>
                    </div>
                  </div>
                </div>

                {/* status updates */}
                <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-3 text-sm backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-200">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      className="h-4 w-4"
                    >
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Pharmacist has checked the prescription
                  </div>
                  <div className="mt-1.5 text-xs text-white/65">
                    Rider is on the way · arriving ~45 min
                  </div>
                </div>

                {/* typing indicator */}
                <div className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-xs text-white/60">Clear help from search to delivery.</span>
                <StoreLink source="how-it-works-demo" className="cta-primary px-4 py-2 text-sm">
                  Try it for real
                </StoreLink>
              </div>
            </div>
          </div>

          {/* Animated step timeline */}
          <div className="relative rounded-[28px] border border-paper-200 bg-white p-5 shadow-card sm:p-7">
            <div className="relative">
              {steps.map((s, i) => (
                <div key={s.n} className="relative flex gap-4 pb-8 last:pb-0">
                  {/* connector line */}
                  {i < steps.length - 1 && (
                    <span
                      className="draw-line absolute left-[21px] top-12 h-[calc(100%-3rem)] w-0.5 bg-gradient-to-b from-brand-400 to-brand-100"
                      style={{ animationDelay: `${i * 0.35}s` }}
                    />
                  )}
                  <span
                    className={`rise-in relative z-10 flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-sm font-bold shadow-card ${
                      i === 0
                        ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                        : i === 1
                          ? 'bg-gradient-to-br from-seal-300 to-seal-400 text-ink-900'
                          : 'bg-gradient-to-br from-ink-800 to-ink-950 text-white'
                    }`}
                    style={{ animationDelay: `${i * 0.2}s` }}
                  >
                    {s.n}
                  </span>
                  <div className="rise-in pt-1" style={{ animationDelay: `${i * 0.2 + 0.1}s` }}>
                    <h4 className="text-lg font-semibold text-ink-900">{s.title}</h4>
                    <p className="mt-1.5 text-sm leading-6 text-ink-900/65">{s.body}</p>
                  </div>
                </div>
              ))}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="hover-lift rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
                  <div className="text-2xl font-semibold text-brand-700">~60 min</div>
                  <div className="mt-1 text-xs text-ink-900/60">
                    delivery when your item is in stock
                  </div>
                </div>
                <div className="hover-lift rounded-2xl border border-seal-200 bg-gradient-to-br from-seal-50 to-white p-4">
                  <div className="text-2xl font-semibold text-ink-900">100%</div>
                  <div className="mt-1 text-xs text-ink-900/60">
                    prescriptions checked before preparation
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section>
        <SectionTitle
          eyebrow="What you get"
          title="Delivery, pickup, and prescription support."
          copy="Get the medicine you need, the way that works for you."
          action={
            <Link href="/services" className="cta-secondary">
              See how it works
            </Link>
          }
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {serviceTracks.map((service, i) => (
            <article
              key={service.title}
              className={`hover-lift rounded-2xl border p-6 shadow-card ${
                i === 0
                  ? 'border-brand-100 bg-gradient-to-b from-brand-50/80 to-white'
                  : i === 2
                    ? 'border-seal-200 bg-gradient-to-b from-seal-50/80 to-white'
                    : 'border-paper-200 bg-white'
              }`}
            >
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
          copy="Genuine medicine, licensed pharmacists, clear prices, and fast delivery."
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

      {/* Branches */}
      <section>
        <SectionTitle
          eyebrow="Find a branch"
          title="A trusted pharmacy near you in Lagos."
          copy="Choose a branch, confirm stock, continue to checkout."
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
          copy="Prescriptions, delivery, pricing, and payment, answered simply."
          action={
            <Link href="/faq" className="cta-secondary">
              Read all FAQs
            </Link>
          }
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {faqs.slice(0, 3).map((faq) => (
            <article key={faq.question} className="surface-card hover-lift p-6">
              <h3 className="text-base font-semibold text-ink-900">{faq.question}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-900/70">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,#062f2d,#0f3b39_55%,#0d9488)] p-8 text-white shadow-lift sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(245,158,11,0.22),transparent_30%),radial-gradient(circle_at_12%_88%,rgba(45,212,191,0.2),transparent_34%)]" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-100">
            Ready when you are
          </div>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Your medicines, the easy way.
          </h2>
          <p className="mt-4 text-base leading-8 text-white/80">
            Browse, order, and receive genuine medicine fast, with pharmacist review where needed.
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
