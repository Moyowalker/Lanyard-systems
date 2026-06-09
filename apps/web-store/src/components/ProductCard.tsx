import Link from 'next/link';
import type { ProductListItemDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { RxBadge } from './RxBadge';
import { AddToCartButton } from './AddToCartButton';

function ProductMedia({ product }: { product: ProductListItemDto }) {
  const image = product.images?.[0];
  const initial = product.name.trim().charAt(0).toUpperCase() || 'L';

  return (
    <div className="relative aspect-[5/4] overflow-hidden rounded-2xl bg-brand-50">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_30%_0%,#dbece4,transparent_70%)]">
          <span className="absolute -bottom-3 right-2 select-none font-display text-[7rem] leading-none text-brand-200/70">
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
      {/* Hover sheen — subtle, single pass on the media. */}
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

  return (
    <article className="group flex h-full flex-col rounded-card border border-paper-200 bg-white p-3.5 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift">
      <div className="relative">
        <Link href={`/products/${product.slug}`} aria-label={product.name}>
          <ProductMedia product={product} />
        </Link>
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {product.requiresPrescription && <RxBadge />}
          {hasDiscount && (
            <span className="rounded-lg bg-ink-900 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-white">
              Save {savingsPct}%
            </span>
          )}
        </div>
        {outOfStock && (
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/90 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-rose-700 shadow-sm">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1.5 pt-4">
        <Link href={`/products/${product.slug}`} className="flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-700">
            {product.genericName ?? product.regulatoryClass}
          </p>
          <h3 className="mt-1.5 line-clamp-2 font-display text-[1.3rem] leading-[1.12] text-ink-950 transition group-hover:text-brand-800">
            {product.name}
          </h3>
          {meta && <p className="mt-2 line-clamp-1 text-sm text-ink-700/75">{meta}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] font-medium">
            <span className="rounded-md bg-paper-100 px-2 py-0.5 text-ink-700/80">
              {product.regulatoryClass}
            </span>
            {!outOfStock && product.available != null && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-brand-800">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                {product.available} in stock
              </span>
            )}
          </div>
        </Link>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-paper-200 pt-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="tnum font-display text-[1.55rem] leading-none text-ink-950">
                {formatKobo(priceKobo)}
              </span>
              {hasDiscount && (
                <span className="tnum text-sm text-ink-700/50 line-through">
                  {formatKobo(compareAtKobo)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[0.68rem] uppercase tracking-[0.14em] text-ink-700/55">
              Pharmacist-reviewed
            </p>
          </div>
          <Link
            href={`/products/${product.slug}`}
            className="hidden rounded-lg border border-paper-200 px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-700/80 transition hover:border-brand-200 hover:text-brand-800 sm:inline-flex"
          >
            Details
          </Link>
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
