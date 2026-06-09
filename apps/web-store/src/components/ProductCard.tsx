import Link from 'next/link';
import type { ProductListItemDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { RxBadge } from './RxBadge';
import { AddToCartButton } from './AddToCartButton';

function ProductMedia({ product }: { product: ProductListItemDto }) {
  const image = product.images?.[0];
  const initial = product.name.trim().charAt(0).toUpperCase() || 'L';

  return (
    <div className="relative aspect-[5/4] overflow-hidden rounded-[1.35rem] bg-[linear-gradient(180deg,#eef5f1_0%,#f7f5ef_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(100%_90%_at_10%_0%,rgba(56,130,107,0.12),transparent_56%)]" />
      {image ? (
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_30%_0%,#dbece4,transparent_70%)]">
          <span className="absolute -bottom-4 right-3 select-none font-display text-[7rem] leading-none text-brand-200/70">
            {initial}
          </span>
          <svg
            viewBox="0 0 48 48"
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-brand-500/80"
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
              strokeWidth="2.4"
            />
            <path d="M19.5 13 28.5 28.6" stroke="currentColor" strokeWidth="2.4" />
          </svg>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </div>
  );
}

export function ProductCard({
  product,
  branchId,
}: {
  product: ProductListItemDto;
  branchId?: string;
}) {
  const outOfStock = product.inStock === false;
  const priceKobo = product.price?.priceKobo;
  const compareAtKobo = product.price?.compareAtKobo;
  const hasDiscount = compareAtKobo != null && priceKobo != null && compareAtKobo > priceKobo;
  const savingsPct = hasDiscount
    ? Math.round(((compareAtKobo! - priceKobo!) / compareAtKobo!) * 100)
    : 0;
  const meta = [product.form, product.strength, product.brand].filter(Boolean).join(' · ');
  const availabilityLabel = outOfStock
    ? 'Currently restocking'
    : product.available != null
      ? `${product.available} available at this branch`
      : 'Available for checkout';
  const careLabel = product.requiresPrescription
    ? 'Pharmacist review required'
    : 'Standard checkout available';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.55rem] border border-paper-200/90 bg-white p-3 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift">
      <div className="relative">
        <Link href={`/products/${product.slug}`} aria-label={product.name}>
          <ProductMedia product={product} />
        </Link>
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.requiresPrescription && <RxBadge />}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.14em] ${
              outOfStock
                ? 'bg-white/90 text-rose-700 shadow-sm'
                : 'bg-brand-50/90 text-brand-800 shadow-sm'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                outOfStock ? 'bg-rose-500' : 'bg-brand-500'
              }`}
            />
            {outOfStock ? 'Restocking' : 'Branch ready'}
          </span>
          {hasDiscount ? (
            <span className="rounded-full bg-ink-950 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
              Save {savingsPct}%
            </span>
          ) : null}
        </div>
        {outOfStock ? (
          <span className="absolute right-3 top-3 rounded-full border border-rose-200 bg-white/90 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-rose-700 shadow-sm">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-2 pb-1 pt-4">
        <div className="flex items-start gap-3">
          <Link href={`/products/${product.slug}`} className="flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-700">
              {product.genericName ?? product.regulatoryClass}
            </p>
            <h3 className="mt-1.5 line-clamp-2 font-display text-[1.32rem] leading-[1.1] text-ink-950 transition group-hover:text-brand-800">
              {product.name}
            </h3>
          </Link>
          <Link
            href={`/products/${product.slug}`}
            aria-label={`View details for ${product.name}`}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-2xl border border-paper-200 bg-white text-ink-700 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:text-brand-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M6 12h12m-5-5 5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>

        {meta ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-700/75">{meta}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2 text-[0.72rem] font-medium">
          <span className="inline-flex items-center gap-1 rounded-full bg-paper-100 px-2.5 py-1 text-ink-700/80">
            {product.regulatoryClass}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
              product.requiresPrescription
                ? 'bg-brand-50 text-brand-800'
                : 'bg-seal-100 text-ink-900'
            }`}
          >
            {careLabel}
          </span>
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-paper-200 bg-paper-50/80 p-3.5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="tnum font-display text-[1.58rem] leading-none text-ink-950">
                  {priceKobo == null ? 'Pricing unavailable' : formatKobo(priceKobo)}
                </span>
                {hasDiscount ? (
                  <span className="tnum text-sm text-ink-700/48 line-through">
                    {formatKobo(compareAtKobo)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-ink-700/62">{availabilityLabel}</p>
            </div>
            <span className="status-chip">Trusted fulfilment</span>
          </div>
        </div>
        <div className="mt-3">
          <AddToCartButton
            branchId={branchId}
            productId={product.id}
            disabled={outOfStock || product.price == null}
          />
        </div>
      </div>
    </article>
  );
}
