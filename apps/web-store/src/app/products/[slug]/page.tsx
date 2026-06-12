import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ProductDetailDto } from '@lanyard/contracts';
import { apiTry } from '@/lib/api';
import { getSelectedBranch } from '@/lib/branch';
import { formatKobo } from '@/lib/format';
import { RxBadge } from '@/components/RxBadge';
import { AddToCartButton } from '@/components/AddToCartButton';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  const branch = await getSelectedBranch();
  const bq = branch ? `?branchId=${branch.id}` : '';
  const product = await apiTry<ProductDetailDto>(
    `/catalog/products/${encodeURIComponent(slug)}${bq}`,
  );
  return { product, branch };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await load(slug);
  return { title: product?.name ?? 'Product' };
}

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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product, branch } = await load(slug);
  if (!product) notFound();

  const outOfStock = product.inStock === false;
  const image = product.images?.[0];
  const initial = product.name.trim().charAt(0).toUpperCase() || 'L';
  const meta = [product.form, product.strength, product.packSize].filter(Boolean).join(' · ');

  const facts = [
    product.manufacturer ? { label: 'Manufacturer', value: product.manufacturer } : null,
    product.nafdacRegNo ? { label: 'NAFDAC reg.', value: product.nafdacRegNo } : null,
    { label: 'Regulatory class', value: product.regulatoryClass },
    product.brand ? { label: 'Brand', value: product.brand } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-ink-700/60">
        <Link href="/" className="font-medium transition hover:text-brand-800">
          Catalogue
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-ink-900">{product.name}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* Media */}
        <div className="surface-panel p-3 lg:summary-sticky">
          <div className="relative aspect-square overflow-hidden rounded-[1.5rem] border border-white/60 bg-[linear-gradient(180deg,#eef7f3_0%,#f8f5ef_56%,#f1ede4_100%)]">
            <div className="absolute inset-0 bg-[radial-gradient(110%_100%_at_0%_0%,rgba(29,106,86,0.16),transparent_58%)]" />
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <>
                <span className="absolute -bottom-6 right-4 select-none font-display text-[10rem] leading-none text-brand-200/70">
                  {initial}
                </span>
                <svg
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                  className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-brand-500/80"
                  fill="none"
                >
                  <rect
                    x="9"
                    y="18"
                    width="30"
                    height="12"
                    rx="6"
                    transform="rotate(-30 24 24)"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  />
                  <path d="M19.5 13 28.5 28.6" stroke="currentColor" strokeWidth="2.2" />
                </svg>
              </>
            )}
            {product.requiresPrescription ? (
              <div className="absolute left-4 top-4">
                <RxBadge />
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 px-1 pb-1">
            {[
              ['Licensed', 'Pharmacist care'],
              ['NAFDAC', 'Registered'],
              ['Branch', 'Local stock'],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-[1.1rem] border border-paper-200 bg-paper-50/80 px-3 py-2.5 text-center">
                <div className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-800">
                  {title}
                </div>
                <div className="mt-0.5 text-[0.66rem] text-ink-700/65">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div className="surface-panel px-5 py-6 sm:px-7 sm:py-7">
            <div className="page-eyebrow">{product.genericName ?? product.regulatoryClass}</div>
            <h1 className="page-title mt-3">{product.name}</h1>
            {meta ? <p className="mt-2 text-sm text-ink-700/70">{meta}</p> : null}

            {product.description ? (
              <p className="mt-4 text-[0.96rem] leading-7 text-ink-700/85">{product.description}</p>
            ) : null}

            <div className="mt-6 rounded-[1.4rem] border border-paper-200 bg-paper-50/85 p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-ink-700/55">
                    Branch price
                  </div>
                  <div className="tnum mt-1 font-display text-[2.2rem] leading-none text-ink-950">
                    {product.price?.priceKobo == null
                      ? 'Pricing unavailable'
                      : formatKobo(product.price.priceKobo)}
                  </div>
                  <div className="mt-2 text-sm">
                    {outOfStock ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-rose-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Out of stock at this branch
                      </span>
                    ) : product.available != null ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-brand-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                        {product.available} available
                        {branch ? ` at ${branch.name}` : ''}
                      </span>
                    ) : (
                      <span className="text-ink-700/60">Select a branch to see availability</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <AddToCartButton
                  branchId={branch?.id}
                  productId={product.id}
                  disabled={outOfStock || product.price == null}
                />
              </div>
            </div>

            {product.requiresPrescription ? (
              <div className="rx-note mt-4">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
                  Rx
                </span>
                <div>
                  <div className="font-semibold text-ink-950">Prescription-only medicine</div>
                  <p className="mt-1 text-ink-700/80">
                    Upload your prescription at checkout. A licensed pharmacist verifies it before
                    your order is dispensed — your safety stays the priority.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {facts.length > 0 ? (
            <div className="surface-panel px-5 py-6 sm:px-7">
              <div className="section-kicker">Product information</div>
              <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="border-b border-paper-200/70 pb-3">
                    <dt className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-700/55">
                      {fact.label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-ink-950">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-5 grid gap-2 sm:grid-cols-3">
                {['Genuine sourcing', 'Cold-chain aware', 'Verified dispensing'].map((point) => (
                  <li key={point} className="flex items-center gap-2 text-sm text-ink-800">
                    <CheckIcon className="h-[18px] w-[18px] text-brand-700" />
                    <span className="font-medium">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
