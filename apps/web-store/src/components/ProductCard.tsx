import Link from 'next/link';
import type { ProductListItemDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { RxBadge } from './RxBadge';
import { AddToCartButton } from './AddToCartButton';

export function ProductCard({
  product,
  branchId,
}: {
  product: ProductListItemDto;
  branchId?: string;
}) {
  const outOfStock = product.inStock === false;
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <Link href={`/products/${product.slug}`} className="group flex-1">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 group-hover:text-brand-700">{product.name}</h3>
          {product.requiresPrescription && <RxBadge />}
        </div>
        <p className="text-sm text-gray-500">
          {[product.form, product.strength].filter(Boolean).join(' · ')}
          {product.brand ? ` · ${product.brand}` : ''}
        </p>
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">{formatKobo(product.price?.priceKobo)}</div>
          {outOfStock ? (
            <span className="text-xs font-medium text-red-600">Out of stock</span>
          ) : product.available != null ? (
            <span className="text-xs text-gray-400">{product.available} in stock</span>
          ) : null}
        </div>
        <AddToCartButton
          branchId={branchId}
          productId={product.id}
          disabled={outOfStock || product.price == null}
        />
      </div>
    </div>
  );
}
