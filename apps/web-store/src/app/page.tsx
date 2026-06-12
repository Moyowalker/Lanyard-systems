import type { CSSProperties } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import type { CategoryDto, Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiTry } from '@/lib/api';
import { listBranches, resolveBranch } from '@/lib/branch';
import { COOKIE } from '@/lib/config';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

const carePillars = [
  {
    title: 'Prescription confidence',
    body: 'Restricted medicines stay behind pharmacist review, with professional cues and clearer status before fulfilment moves ahead.',
  },
  {
    title: 'Live branch availability',
    body: 'Pricing and stock reflect your selected branch so the promises you see at discovery still hold at checkout.',
  },
  {
    title: 'Built for repeat care',
    body: 'Refills, everyday essentials, and pickup or delivery stay in one patient journey instead of feeling like separate systems.',
  },
];

const careJourney = [
  {
    step: '01',
    title: 'Choose your branch',
    body: 'Set the branch you trust to unlock local pricing, stock visibility, and the right fulfilment options from the start.',
  },
  {
    step: '02',
    title: 'Add medicines or upload an Rx',
    body: 'Move quickly for OTC essentials, or stay in a pharmacist-controlled lane for prescription medicines that need review.',
  },
  {
    step: '03',
    title: 'Receive verified fulfilment',
    body: 'Orders move through review, preparation, and handoff with branch-led visibility all the way to pickup or delivery.',
  },
];

const careSignals = [
  {
    title: 'Browse with clinical clarity',
    body: 'Medicine discovery stays calm, legible, and branch-aware instead of looking like generic retail.',
  },
  {
    title: 'Keep prescriptions controlled',
    body: 'Prescription-only products keep the right friction in place, without making the rest of the journey feel heavy.',
  },
  {
    title: 'Move to fulfilment confidently',
    body: 'Pickup and delivery expectations stay grounded in real branch stock and professional review.',
  },
];

const trustMoments = [
  {
    label: 'Prescription lane',
    title: 'Controlled review where it matters.',
    body: 'Prescription-only medicines remain behind pharmacist checks without making OTC discovery feel heavy.',
  },
  {
    label: 'Branch truth',
    title: 'Availability that matches the branch you choose.',
    body: 'Pricing, stock, pickup timing, and delivery confidence stay tied to a real operational context.',
  },
  {
    label: 'Modern checkout',
    title: 'A cleaner route from search to fulfilment.',
    body: 'Patients can move quickly when they should and slow down only where safety and verification demand it.',
  },
];

const assurances = ['Licensed pharmacists', 'NAFDAC-registered medicines', 'Branch-aware stock'];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" className="fill-brand-100" />
      <path
        d="m8.5 12.2 2.3 2.3 4.7-4.9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function HomePage() {
  const branches = await listBranches().catch(() => []);
  const selected = resolveBranch(branches, (await cookies()).get(COOKIE.branch)?.value);
  const branchQuery = selected ? `?branchId=${selected.id}` : '';

  const [productsResponse, categoriesResponse] = await Promise.all([
    apiTry<Paginated<ProductListItemDto>>(`/catalog/products${branchQuery}`),
    apiTry<{ data: CategoryDto[] }>(`/catalog/categories`),
  ]);

  const products = productsResponse?.data ?? [];
  const categories = categoriesResponse?.data ?? [];
  const productsUnavailable = productsResponse == null;
  const categoriesUnavailable = categoriesResponse == null;
  const storefrontUnavailable = productsUnavailable || categoriesUnavailable;

  const trustStats = [
    {
      value: productsUnavailable ? 'Live' : `${products.length}`,
      label: productsUnavailable ? 'Catalogue reconnecting' : 'Live catalogue picks',
    },
    {
      value: categoriesUnavailable ? 'Sync' : `${categories.length}`,
      label: categoriesUnavailable ? 'Categories reconnecting' : 'Care categories',
    },
    { value: `${branches.length}`, label: 'Branch locations' },
  ];
  const featuredCategories = categories.slice(0, 6);
  const branchSummary = selected
    ? `${selected.address.line1}, ${selected.address.city}. Pricing, stock, and fulfilment promises are now shaped by this branch.`
    : 'Choose a branch from the header to unlock local pricing, availability, and more reliable delivery or pickup expectations.';

  return (
    <div className="space-y-10 pb-10 sm:space-y-16 sm:pb-14">
      <section className="animate-rise grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <div className="surface-panel px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-11">
          <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(90%_90%_at_8%_0%,rgba(29,106,86,0.18),transparent_70%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow-chip">Premium digital pharmacy</span>
              <span className="status-chip">Built for safe fulfilment</span>
              <span className="status-chip">Designed for public launch</span>
            </div>

            <h1 className="mt-6 max-w-4xl font-display text-[2.9rem] font-medium leading-[0.96] text-ink-950 sm:text-[3.5rem] lg:text-[4.45rem]">
              Trusted pharmacy care, designed like a premium product and backed by real branch
              operations.
            </h1>

            <p className="supporting-copy mt-6 max-w-2xl text-base sm:text-lg">
              Lanyard brings medicine discovery, prescription safeguards, and branch-aware
              fulfilment into one polished patient journey that feels clinical, modern, and
              dependable.
              {selected
                ? ` You are currently browsing against ${selected.name}, ${selected.address.city}.`
                : ' Choose a preferred branch to see local pricing, live availability, and more dependable fulfilment options.'}
            </p>

            {storefrontUnavailable ? (
              <div className="surface-quiet mt-6 px-4 py-4 sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-brand-100 text-brand-800">
                    <CheckIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-ink-950">
                      Live catalogue data is temporarily unavailable.
                    </div>
                    <p className="mt-1 text-sm leading-6 text-ink-700/80">
                      The storefront shell is still available while we reconnect to the product and
                      category services. Branch context, care guidance, and browsing structure
                      remain visible.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#catalog" className="primary-button">
                Shop medicines
                <ArrowIcon className="h-4 w-4" />
              </Link>
              <Link href="#how-it-works" className="secondary-button">
                See how ordering works
              </Link>
            </div>

            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {assurances.map((assurance) => (
                <li
                  key={assurance}
                  className="surface-quiet flex items-center gap-3 px-4 py-4 text-sm text-ink-800"
                >
                  <CheckIcon className="h-[18px] w-[18px] text-brand-700" />
                  <span className="font-medium">{assurance}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-8 grid gap-3 sm:grid-cols-3">
              {trustStats.map((stat) => (
                <div key={stat.label} className="metric-card">
                  <dt className="tnum font-display text-[2.1rem] leading-none text-ink-950">
                    {stat.value}
                  </dt>
                  <dd className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-700/62">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="surface-panel-dark px-6 py-7 sm:px-7 sm:py-8">
            <div className="absolute inset-x-0 -top-24 h-60 bg-[radial-gradient(60%_100%_at_72%_0%,rgba(61,161,126,0.38),transparent_70%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-brand-200">
                <span className="h-1.5 w-1.5 rounded-full bg-seal-300" />
                Operational trust
              </div>
              <h2 className="mt-5 font-display text-[2.05rem] leading-[1.05] text-white">
                See the branch, the care lane, and the fulfilment context before checkout.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/72">
                Lanyard keeps prescription review visible and keeps branch pricing honest, so the
                platform feels safer than generic ecommerce from the first interaction.
              </p>

              <div className="mt-6 rounded-[1.55rem] border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                  Active branch context
                </div>
                <div className="mt-3 font-display text-[1.35rem] text-white">
                  {selected ? selected.name : 'Choose the branch closest to you'}
                </div>
                <p className="mt-2 text-sm leading-6 text-white/68">{branchSummary}</p>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                {trustMoments.map((moment) => (
                  <article
                    key={moment.title}
                    className="rounded-[1.4rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"
                  >
                    <div className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-brand-200">
                      {moment.label}
                    </div>
                    <h3 className="mt-3 font-display text-[1.3rem] leading-tight text-white">
                      {moment.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/68">{moment.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="surface-panel px-6 py-6 sm:px-7">
            <div className="section-kicker">What patients can do today</div>
            <div className="mt-5 space-y-3">
              {careSignals.map((signal, index) => (
                <div key={signal.title} className="surface-quiet px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className="tnum flex h-10 w-10 items-center justify-center rounded-[1rem] bg-brand-100 font-display text-base text-brand-800">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-ink-950">{signal.title}</div>
                      <p className="mt-1 text-sm leading-6 text-ink-700/80">{signal.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {featuredCategories.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {featuredCategories.slice(0, 4).map((category) => (
                  <Link
                    key={category.id}
                    href={`/category/${category.slug}`}
                    className="inline-flex items-center rounded-full border border-paper-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section id="categories" className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="surface-panel px-6 py-8 sm:px-8">
          <div className="section-kicker">Why Lanyard stands out</div>
          <h2 className="section-heading mt-4">
            Pharmacy-grade trust signals, expressed with the composure of a premium product.
          </h2>
          <p className="supporting-copy mt-4">
            Every major cue in the experience should reduce uncertainty: what requires review, where
            stock lives, and how quickly a patient can move into fulfilment.
          </p>

          <div className="mt-7 space-y-3">
            {carePillars.map((pillar, index) => (
              <div key={pillar.title} className="surface-quiet px-4 py-4">
                <div className="flex gap-4">
                  <div className="tnum flex h-10 w-10 flex-none items-center justify-center rounded-[1rem] bg-brand-100 font-display text-base text-brand-800">
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-[1rem] font-semibold text-ink-950">{pillar.title}</div>
                    <p className="mt-1.5 text-sm leading-6 text-ink-700/80">{pillar.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.length > 0 ? (
            categories.map((category, index) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group surface-panel flex min-h-[16rem] flex-col justify-between px-5 py-6 transition duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lift"
              >
                <div>
                  <div className="tnum text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-ink-700/45">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h3 className="mt-4 font-display text-[1.9rem] leading-[1.04] text-ink-950 transition group-hover:text-brand-800">
                    {category.name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-ink-700/75">
                    Browse clinically organised medicines with clearer prescription cues, tighter
                    product framing, and calmer discovery flows.
                  </p>
                </div>

                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  Open category
                  <ArrowIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))
          ) : (
            <div className="state-card sm:col-span-2 xl:col-span-3">
              {categoriesUnavailable
                ? 'Category browsing is temporarily unavailable while the storefront reconnects to the live catalogue service.'
                : 'Categories will appear here once catalogue groupings are available for the selected branch.'}
            </div>
          )}
        </div>
      </section>

      <section id="how-it-works" className="surface-panel px-6 py-8 sm:px-8 sm:py-10">
        <div className="max-w-2xl">
          <div className="section-kicker">How ordering works</div>
          <h2 className="section-heading mt-4">
            A calmer patient flow, with the right amount of professional friction.
          </h2>
          <p className="supporting-copy mt-4">
            The journey stays fast for everyday needs and deliberate where regulation or clinical
            review matters, so the experience feels premium without becoming loose.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {careJourney.map((item, index) => (
            <article key={item.step} className="surface-quiet px-5 py-5">
              <div className="flex items-center gap-3">
                <span className="tnum flex h-11 w-11 items-center justify-center rounded-[1rem] bg-brand-100 font-display text-lg text-brand-800">
                  {item.step}
                </span>
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-700/55">
                  {index === 0
                    ? 'Discovery setup'
                    : index === 1
                      ? 'Medication selection'
                      : 'Verified fulfilment'}
                </span>
              </div>
              <h3 className="mt-5 font-display text-[1.45rem] leading-tight text-ink-950">
                {item.title}
              </h3>
              <p className="mt-2.5 text-sm leading-6 text-ink-700/80">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="catalog"
        className="grid gap-6 xl:grid-cols-[minmax(300px,0.38fr)_minmax(0,0.62fr)]"
      >
        <div className="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <div className="surface-panel px-6 py-8 sm:px-7">
            <div className="section-kicker">Medicine discovery</div>
            <h2 className="section-heading mt-4">
              {selected
                ? `Catalogue for ${selected.name}`
                : 'Start with the medicines you need most'}
            </h2>
            <p className="supporting-copy mt-4">
              Search, compare, and add with clearer stock, prescription, and pricing cues. The
              storefront stays grounded in branch reality so checkout feels dependable.
            </p>

            <div className="mt-6 rounded-[1.45rem] border border-paper-200 bg-paper-50/85 p-4">
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-brand-700">
                Current fulfilment context
              </div>
              <div className="mt-2 text-lg font-display text-ink-950">
                {selected ? selected.name : 'Choose your preferred branch'}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-700/80">{branchSummary}</p>
            </div>

            {featuredCategories.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {featuredCategories.slice(0, 5).map((category) => (
                  <Link
                    key={category.id}
                    href={`/category/${category.slug}`}
                    className="inline-flex items-center rounded-full border border-paper-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="state-card">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-brand-100 text-brand-800">
                <CheckIcon className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink-950">Designed for repeat care</div>
                <p className="mt-1 text-sm leading-6 text-ink-700/80">
                  Orders, branch context, and prescription status stay legible instead of getting
                  lost inside generic ecommerce chrome.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="section-kicker">Featured catalogue</div>
              <h2 className="section-heading mt-3">
                {selected ? `Available at ${selected.name}` : 'Explore available medicines'}
              </h2>
              <p className="supporting-copy mt-3 max-w-2xl">
                Product cards surface prescription cues, pricing, and fulfilment readiness in a
                clearer hierarchy built for launch review.
              </p>
            </div>
            <div className="tnum inline-flex items-center gap-2 self-start rounded-full border border-paper-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-700/70 shadow-card sm:self-auto">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {productsUnavailable
                ? 'Live catalogue unavailable'
                : `${products.length} items visible`}
            </div>
          </div>

          {productsUnavailable ? (
            <div className="state-card flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-brand-100 text-brand-800">
                <CheckIcon className="h-6 w-6" />
              </span>
              <div>
                <div className="font-display text-2xl text-ink-950">
                  Live catalogue is temporarily unavailable.
                </div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-700/80">
                  We could not reach the product service right now, so medicine cards are
                  temporarily hidden instead of failing the entire homepage.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {categories.length > 0 ? (
                  <Link href="#categories" className="secondary-button">
                    Explore categories
                  </Link>
                ) : null}
                <Link href="#how-it-works" className="secondary-button">
                  Review care flow
                </Link>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="state-card flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-brand-100 text-brand-800">
                <CheckIcon className="h-6 w-6" />
              </span>
              <div>
                <div className="font-display text-2xl text-ink-950">
                  No medicines are visible yet.
                </div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-700/80">
                  This branch does not currently expose a storefront catalogue. Choose another
                  branch above or explore category browsing while the inventory becomes available.
                </p>
              </div>
              <Link href="#categories" className="secondary-button">
                Explore categories
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product, index) => (
                <div
                  key={product.id}
                  className="reveal h-full"
                  style={{ '--reveal-delay': `${Math.min(index, 8) * 60}ms` } as CSSProperties}
                >
                  <ProductCard product={product} branchId={selected?.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="surface-panel-dark px-6 py-8 sm:px-8 sm:py-10">
        <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(55%_100%_at_15%_0%,rgba(216,184,108,0.18),transparent_72%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-200">
              <span className="h-[2px] w-8 rounded-full bg-brand-300/60" />
              Premium pharmacy, not generic ecommerce
            </div>
            <h2 className="mt-5 font-display text-[2.35rem] leading-[1.02] text-white sm:text-[2.95rem]">
              Make trust visible before the patient ever reaches checkout.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">
              A modern digital pharmacy should reassure, guide, and convert without hiding the
              clinical safeguards underneath. That is the tone this storefront now sets.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="#catalog"
              className="inline-flex items-center justify-center gap-2 rounded-[1.15rem] bg-white px-5 py-3.5 text-sm font-semibold text-ink-950 transition duration-300 hover:-translate-y-0.5 hover:bg-paper-100"
            >
              Browse medicines
              <ArrowIcon className="h-4 w-4" />
            </Link>
            <Link
              href="#categories"
              className="inline-flex items-center justify-center gap-2 rounded-[1.15rem] border border-white/15 bg-white/10 px-5 py-3.5 text-sm font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-white/14"
            >
              Explore categories
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
