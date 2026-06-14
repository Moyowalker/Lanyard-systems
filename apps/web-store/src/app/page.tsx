import type { CSSProperties } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import type { CategoryDto, Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiTry } from '@/lib/api';
import { listBranches, resolveBranch } from '@/lib/branch';
import { COOKIE } from '@/lib/config';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

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
  const featuredCategories = categories.slice(0, 8);
  const branchLabel = selected ? selected.name : null;

  return (
    <div className="space-y-8">
      {/* Hero — branch context + delivery promise */}
      <section className="surface-panel-dark animate-rise overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-brand-100">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
              {branchLabel ? `Shopping ${branchLabel}` : 'Choose your branch to begin'}
            </div>
            <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.01em] text-white sm:text-[2rem]">
              Genuine medicines, from a pharmacy you can verify.
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/75">
              Search, add to cart, and get it by delivery or branch pickup — with every prescription
              checked by a licensed pharmacist before it leaves the counter.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                href="/search"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-brand-50"
              >
                Browse medicines
                <ArrowIcon className="h-4 w-4" />
              </Link>
              <Link
                href="/checkout"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Upload a prescription
              </Link>
            </div>
          </div>

          <div className="grid w-full max-w-sm grid-cols-1 gap-2.5">
            {[
              [
                'truck',
                'Delivery or free pickup',
                branchLabel ? `from ${branchLabel}` : 'at your selected branch',
              ],
              ['shield', 'Pharmacist-verified', 'prescriptions checked before release'],
              ['tag', 'Branch-accurate pricing', 'real stock, no surprises at checkout'],
            ].map(([icon, title, sub]) => (
              <div
                key={title}
                className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-3 text-white"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/15 text-brand-100">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    {icon === 'truck' && (
                      <>
                        <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" strokeLinejoin="round" />
                        <circle cx="7" cy="18" r="1.6" />
                        <circle cx="17.5" cy="18" r="1.6" />
                      </>
                    )}
                    {icon === 'shield' && (
                      <path
                        d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Zm-2.5 9 1.8 1.8L15 10"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {icon === 'tag' && (
                      <>
                        <path
                          d="M20.6 13.4 13 21l-9-9V4h8l8.6 8.6a1.4 1.4 0 0 1 0 2Z"
                          strokeLinejoin="round"
                        />
                        <circle cx="8.5" cy="8.5" r="1.4" />
                      </>
                    )}
                  </svg>
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs text-white/65">{sub}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Category quick-nav */}
      {featuredCategories.length > 0 ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Shop by category</h2>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-8">
            {featuredCategories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group flex flex-none flex-col items-center gap-2 rounded-xl border border-paper-200 bg-white px-4 py-3.5 text-center transition hover:border-brand-200 hover:bg-brand-50 sm:flex-1"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-white">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <rect x="9" y="6" width="12" height="6" rx="3" transform="rotate(-30 24 24)" />
                    <path d="M4 9h7M4 13h5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="whitespace-nowrap text-xs font-medium text-ink-900 sm:whitespace-normal">
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Product grid */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-900">
            {branchLabel ? `Popular at ${branchLabel}` : 'Popular medicines'}
          </h2>
          {!productsUnavailable && products.length > 0 ? (
            <Link
              href="/search"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              See all
            </Link>
          ) : null}
        </div>

        {productsUnavailable ? (
          <div className="state-card flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-base font-semibold text-ink-900">Catalogue is reconnecting</div>
            <p className="max-w-md text-sm text-ink-900/70">
              We couldn&apos;t reach the product service just now. Please try again in a moment.
            </p>
          </div>
        ) : products.length === 0 ? (
          <div className="state-card flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-base font-semibold text-ink-900">No medicines yet</div>
            <p className="max-w-md text-sm text-ink-900/70">
              {selected
                ? 'This branch has no published catalogue yet — try another branch.'
                : 'Choose a branch above to see medicines, pricing, and stock.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((product, index) => (
              <div
                key={product.id}
                className="reveal h-full"
                style={{ '--reveal-delay': `${Math.min(index, 10) * 40}ms` } as CSSProperties}
              >
                <ProductCard product={product} branchId={selected?.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Prescription CTA */}
      <section className="surface-panel flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-seal-100 text-amber-700">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink-900">Have a prescription?</h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-ink-900/70">
              Add your prescription items to the cart and upload it at checkout — a pharmacist
              verifies it before your order is dispensed.
            </p>
          </div>
        </div>
        <Link href="/search" className="primary-button w-full sm:w-auto">
          Start an order
          <ArrowIcon className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
