import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ProductDetailDto } from '@lanyard/contracts';
import { apiTry } from '@/lib/api';
import { getSelectedBranch } from '@/lib/branch';
import { formatKobo } from '@/lib/format';
import { ProductGallery } from '@/components/ProductGallery';
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
  const meta = [product.form, product.strength, product.packSize].filter(Boolean).join(' · ');

  const facts = [
    product.manufacturer ? { label: 'Manufacturer', value: product.manufacturer } : null,
    product.brand ? { label: 'Brand', value: product.brand } : null,
    product.nafdacRegNo ? { label: 'NAFDAC reg.', value: product.nafdacRegNo } : null,
    { label: 'Regulatory class', value: product.regulatoryClass },
    product.packSize ? { label: 'Pack size', value: product.packSize } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-ink-900/55">
        <Link href="/" className="font-medium transition hover:text-brand-700">
          Catalogue
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-ink-900">{product.name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gallery */}
        <div className="lg:summary-sticky">
          <ProductGallery
            images={product.images ?? []}
            name={product.name}
            rx={product.requiresPrescription}
          />
        </div>

        {/* Buy box */}
        <div className="space-y-5">
          <div>
            <div className="page-eyebrow">{product.genericName ?? product.regulatoryClass}</div>
            <h1 className="page-title mt-2">{product.name}</h1>
            {meta ? <p className="mt-1.5 text-sm text-ink-900/60">{meta}</p> : null}
          </div>

          <div className="surface-panel p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="tnum text-3xl font-semibold text-ink-900">
                  {product.price?.priceKobo == null
                    ? 'Pricing unavailable'
                    : formatKobo(product.price.priceKobo)}
                </div>
                <div className="mt-1.5 text-sm">
                  {outOfStock ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-rose-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      Out of stock at this branch
                    </span>
                  ) : product.available != null ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-brand-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      {product.available} available{branch ? ` at ${branch.name}` : ''}
                    </span>
                  ) : (
                    <span className="text-ink-900/55">Select a branch to see availability</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <AddToCartButton
                branchId={branch?.id}
                productId={product.id}
                disabled={outOfStock || product.price == null}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-paper-200 pt-4 text-center">
              {[
                ['Licensed', 'pharmacist care'],
                ['NAFDAC', 'registered'],
                ['Branch', 'pickup or delivery'],
              ].map(([t, s]) => (
                <div key={t}>
                  <div className="text-xs font-semibold text-brand-700">{t}</div>
                  <div className="text-[0.68rem] text-ink-900/55">{s}</div>
                </div>
              ))}
            </div>
          </div>

          {product.requiresPrescription ? (
            <div className="rx-note">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-seal-200 font-semibold text-amber-900">
                ℞
              </span>
              <div>
                <div className="font-semibold text-ink-900">Prescription-only medicine</div>
                <p className="mt-1 text-ink-900/75">
                  Upload your prescription at checkout. A licensed pharmacist verifies it before your
                  order is dispensed.
                </p>
              </div>
            </div>
          ) : null}

          {product.description ? (
            <div className="surface-panel p-5">
              <div className="section-kicker">About this product</div>
              <p className="mt-3 text-sm leading-7 text-ink-900/80">{product.description}</p>
            </div>
          ) : null}

          {facts.length > 0 ? (
            <div className="surface-panel p-5">
              <div className="section-kicker">Product information</div>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex justify-between gap-3 border-b border-paper-100 pb-2">
                    <dt className="text-sm text-ink-900/55">{fact.label}</dt>
                    <dd className="text-sm font-medium text-ink-900">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
