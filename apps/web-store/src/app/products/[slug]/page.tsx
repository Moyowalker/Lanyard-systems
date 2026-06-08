import { notFound } from 'next/navigation';
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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { product, branch } = await load(slug);
  if (!product) notFound();

  const outOfStock = product.inStock === false;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <p className="mt-1 text-gray-500">
              {[product.form, product.strength, product.packSize].filter(Boolean).join(' · ')}
              {product.brand ? ` · ${product.brand}` : ''}
            </p>
          </div>
          {product.requiresPrescription && <RxBadge />}
        </div>

        {product.description && <p className="mt-4 text-gray-700">{product.description}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm text-gray-600">
          {product.manufacturer && (
            <div>
              <dt className="text-gray-400">Manufacturer</dt>
              <dd>{product.manufacturer}</dd>
            </div>
          )}
          {product.nafdacRegNo && (
            <div>
              <dt className="text-gray-400">NAFDAC Reg.</dt>
              <dd>{product.nafdacRegNo}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-400">Class</dt>
            <dd>{product.regulatoryClass}</dd>
          </div>
        </dl>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {formatKobo(product.price?.priceKobo)}
            </div>
            {outOfStock ? (
              <span className="text-sm font-medium text-red-600">Out of stock at this branch</span>
            ) : product.available != null ? (
              <span className="text-sm text-gray-400">{product.available} in stock</span>
            ) : (
              <span className="text-sm text-gray-400">Select a branch to see availability</span>
            )}
          </div>
          <AddToCartButton
            branchId={branch?.id}
            productId={product.id}
            disabled={outOfStock || product.price == null}
          />
        </div>

        {product.requiresPrescription && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This is a prescription-only medicine. You’ll upload a prescription at checkout, and a
            pharmacist must verify it before your order is dispensed.
          </p>
        )}
      </div>
    </div>
  );
}
