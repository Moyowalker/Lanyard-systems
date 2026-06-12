import Link from 'next/link';
import type { Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';
import { getSelectedBranch } from '@/lib/branch';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const branch = await getSelectedBranch();
  const bq = branch ? `&branchId=${branch.id}` : '';
  const products = await apiFetch<Paginated<ProductListItemDto>>(
    `/catalog/products?category=${encodeURIComponent(slug)}${bq}`,
  );

  const title = slug.replace(/-/g, ' ');
  const count = products.data.length;

  return (
    <div className="space-y-6">
      <div className="surface-panel px-6 py-7 sm:px-8 sm:py-8">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(90%_100%_at_8%_0%,rgba(29,106,86,0.16),transparent_72%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="page-eyebrow">Care category</div>
            <h1 className="page-title mt-3 capitalize">{title}</h1>
            <p className="supporting-copy mt-3 max-w-xl">
              {branch
                ? `Showing medicines available at ${branch.name} with branch-accurate pricing and stock.`
                : 'Choose a branch from the header to unlock local pricing and live availability.'}
            </p>
          </div>
          <span className="tnum inline-flex w-fit items-center gap-2 rounded-full border border-paper-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-700/70 shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {count === 0 ? (
        <div className="state-card flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <div>
            <div className="font-display text-2xl text-ink-950">Nothing here yet</div>
            <p className="mt-2 max-w-md text-sm leading-6 text-ink-700/80">
              No products in this category are available at your selected branch right now. Try
              another branch or browse the full catalogue.
            </p>
          </div>
          <Link href="/" className="secondary-button">
            Back to catalogue
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.data.map((p) => (
            <ProductCard key={p.id} product={p} branchId={branch?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
