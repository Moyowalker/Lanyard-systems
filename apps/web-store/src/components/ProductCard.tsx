import Link from 'next/link';
import type { ProductListItemDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { RxBadge } from './RxBadge';
import { ProductQuantityControl } from './ProductQuantityControl';

function ProductMedia({ product }: { product: ProductListItemDto }) {
  const image = product.images?.[0];
  const form = product.form?.replace(/_/g, ' ') || 'Medicine';

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gradient-to-br from-brand-50 via-white to-paper-50">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-between p-4">
          <span className="max-w-[7.5rem] text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-brand-800/75">
            {form}
          </span>
          <svg
            viewBox="0 0 48 48"
            aria-hidden="true"
            className="h-12 w-12 text-brand-500/70"
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
        </div>
      )}
      {product.requiresPrescription ? (
        <div className="absolute left-2 top-2">
          <RxBadge />
        </div>
      ) : null}
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
  const meta = [product.form, product.strength, product.packSize].filter(Boolean).join(' · ');

  const stockLabel = outOfStock
    ? 'Out of stock'
    : product.available != null && product.available <= 10
      ? 'Low stock'
      : product.available != null
        ? 'In stock'
        : null;
  const stockTone = outOfStock
    ? 'text-rose-600'
    : product.available != null && product.available <= 10
      ? 'text-amber-700'
      : 'text-brand-700';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-paper-200 bg-white p-2.5 transition duration-200 hover:border-brand-300 hover:shadow-lift">
      <Link href={`/products/${product.slug}`} aria-label={product.name}>
        <ProductMedia product={product} />
      </Link>

      <div className="flex flex-1 flex-col px-1 pt-2.5">
        <Link href={`/products/${product.slug}`}>
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-ink-900 transition group-hover:text-brand-700">
            {product.name}
          </h3>
        </Link>
        {meta ? <p className="mt-0.5 text-xs text-ink-900/55">{meta}</p> : null}
        {product.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-ink-900/65">
            {product.description}
          </p>
        ) : null}

        <div className="mt-2 flex items-baseline gap-2">
          <span className="tnum text-base font-semibold text-ink-900">
            {priceKobo == null ? 'Unavailable' : formatKobo(priceKobo)}
          </span>
          {hasDiscount ? (
            <span className="tnum text-xs text-ink-900/40 line-through">
              {formatKobo(compareAtKobo)}
            </span>
          ) : null}
        </div>

        {stockLabel ? (
          <div className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${stockTone}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {stockLabel}
            {product.requiresPrescription ? (
              <span className="text-ink-900/45">· prescription</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5">
          <ProductQuantityControl
            branchId={branchId}
            productId={product.id}
            productName={product.name}
            available={product.available}
            disabled={outOfStock || product.price == null}
          />
        </div>
      </div>
    </article>
  );
}
