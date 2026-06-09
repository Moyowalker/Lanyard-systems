import Link from 'next/link';
import { cookies } from 'next/headers';
import type { CategoryDto, Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';
import { listBranches, resolveBranch } from '@/lib/branch';
import { COOKIE } from '@/lib/config';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

const carePillars = [
  {
    title: 'Prescription confidence',
    body: 'Restricted medicines remain behind pharmacist review, with clear status updates before they are dispensed.',
  },
  {
    title: 'Live branch availability',
    body: 'Pricing and stock reflect your selected branch so checkout matches what can actually be fulfilled.',
  },
  {
    title: 'Built for repeat care',
    body: 'Refills, everyday essentials, and branch pickup or delivery live in the same patient journey.',
  },
];

const careJourney = [
  {
    step: '01',
    title: 'Choose your branch',
    body: 'Pick the branch you trust to unlock local pricing, stock visibility, and fulfilment options.',
  },
  {
    step: '02',
    title: 'Add medicines or upload an Rx',
    body: 'Shop OTC essentials or proceed with prescription medicines that need pharmacist approval.',
  },
  {
    step: '03',
    title: 'Receive verified fulfilment',
    body: 'Orders move through review, preparation, and handoff with branch-led visibility the whole way.',
  },
];

export default async function HomePage() {
  const branches = await listBranches().catch(() => []);
  const selected = resolveBranch(branches, (await cookies()).get(COOKIE.branch)?.value);
  const branchQuery = selected ? `?branchId=${selected.id}` : '';

  const [products, categories] = await Promise.all([
    apiFetch<Paginated<ProductListItemDto>>(`/catalog/products${branchQuery}`),
    apiFetch<{ data: CategoryDto[] }>(`/catalog/categories`),
  ]);

  const trustStats = [
    {
      value: `${Math.max(products.data.length, 1)}+`,
      label: 'live catalogue picks',
    },
    {
      value: `${Math.max(categories.data.length, 1)}`,
      label: 'care categories',
    },
    {
      value: `${Math.max(branches.length, 1)}`,
      label: 'branch locations',
    },
  ];

  return (
    <div className="space-y-6 pb-8 sm:space-y-8">
      <section className="surface-panel animate-rise overflow-hidden px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="space-y-6">
            <div>
              <div className="section-kicker">Healthcare, with confidence</div>
              <h1 className="mt-4 max-w-3xl text-4xl leading-none text-slate-950 sm:text-5xl lg:text-6xl">
                Premium pharmacy care, without the waiting room friction.
              </h1>
              <p className="supporting-copy mt-5 max-w-2xl text-base sm:text-lg">
                Browse medicines, manage prescriptions, and place branch-aware orders in a storefront
                designed to feel calm, credible, and clinical.
                {selected
                  ? ` Live stock and pricing are currently aligned to ${selected.name}, ${selected.address.city}.`
                  : ' Select your preferred branch to unlock local stock visibility and delivery options.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="#catalog" className="primary-button">
                Browse medicines
              </Link>
              <Link href="#how-it-works" className="soft-button">
                See how it works
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {trustStats.map((stat) => (
                <div key={stat.label} className="metric-card">
                  <div className="text-2xl font-semibold text-slate-950">{stat.value}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[1.85rem] bg-slate-950 p-6 text-white shadow-[0_32px_80px_-40px_rgba(15,23,42,0.9)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.35),transparent_38%)]" />
              <div className="relative">
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-brand-200">
                  Care standard
                </div>
                <h2 className="mt-4 text-3xl leading-tight text-white">
                  Every order is anchored in licensed pharmacy workflows.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Prescription medicines are only dispensed after review, and branch-aware stock
                  keeps the catalogue honest from discovery to fulfilment.
                </p>

                <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-100">
                    Active branch
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {selected ? selected.name : 'Choose the branch closest to you'}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {selected
                      ? `${selected.address.city} is currently driving your visible prices and availability.`
                      : 'Set a branch from the header to see live local stock and fulfilment options.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {carePillars.map((pillar) => (
                <div key={pillar.title} className="metric-card bg-white/85">
                  <div className="text-sm font-semibold text-slate-950">{pillar.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{pillar.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="surface-panel px-6 py-7 sm:px-8">
          <div className="section-kicker">Why patients stay</div>
          <h2 className="section-heading mt-4">A storefront that behaves like a real pharmacy front desk.</h2>
          <p className="supporting-copy mt-4">
            Lanyard is designed around medication trust cues: local branch visibility, prescription
            review, and calmer commerce patterns that feel clinical instead of generic.
          </p>
          <div className="mt-6 space-y-4">
            {carePillars.map((pillar, index) => (
              <div key={pillar.title} className="flex gap-4 rounded-[1.35rem] bg-slate-50/90 p-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                  0{index + 1}
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-950">{pillar.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{pillar.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {categories.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categories.data.map((category, index) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="surface-panel group px-5 py-6 transition duration-300 hover:-translate-y-1 hover:border-brand-200"
              >
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Category {String(index + 1).padStart(2, '0')}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <h3 className="text-2xl leading-tight text-slate-950 transition group-hover:text-brand-800">
                    {category.name}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition group-hover:bg-brand-50 group-hover:text-brand-800">
                    Explore
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Browse clinically organised products with branch-aware pricing and availability.
                </p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section id="how-it-works" className="surface-panel px-6 py-7 sm:px-8 sm:py-8">
        <div className="max-w-2xl">
          <div className="section-kicker">How it works</div>
          <h2 className="section-heading mt-4">Designed for the pace of real medication decisions.</h2>
          <p className="supporting-copy mt-4">
            The flow stays simple for OTC essentials and deliberate for prescription-only care, so
            patients can move quickly without losing the signals that matter.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {careJourney.map((item) => (
            <div key={item.step} className="rounded-[1.5rem] bg-slate-900/[0.03] p-5">
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">
                {item.step}
              </div>
              <h3 className="mt-4 text-2xl leading-tight text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="catalog" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="section-kicker">Featured catalogue</div>
            <h2 className="section-heading mt-3">
              {selected ? `Available at ${selected.name}` : 'Explore available medicines'}
            </h2>
            <p className="supporting-copy mt-3 max-w-2xl">
              Thoughtfully presented product cards keep prescription status, live availability, and
              pricing readable at a glance.
            </p>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-sm">
            {products.data.length} items visible now
          </div>
        </div>

        {products.data.length === 0 ? (
          <div className="surface-panel px-6 py-8 text-sm text-slate-600">
            No products are available at this branch yet. Choose another branch above to preview a
            different local catalogue.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.data.map((product) => (
              <ProductCard key={product.id} product={product} branchId={selected?.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
