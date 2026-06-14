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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-eyebrow">Category</div>
          <h1 className="page-title mt-2 capitalize">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-900/60">
            {branch
              ? `Available at ${branch.name} with branch-accurate pricing and stock.`
              : 'Choose a branch from the header for local pricing and live stock.'}
          </p>
        </div>
        <span className="ghost-pill">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </div>

      {count === 0 ? (
        <div className="state-card flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-base font-semibold text-ink-900">Nothing here yet</div>
          <p className="max-w-md text-sm text-ink-900/70">
            No products in this category are available at your branch right now. Try another branch
            or browse the full catalogue.
          </p>
          <Link href="/" className="secondary-button">
            Back to catalogue
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.data.map((p) => (
            <ProductCard key={p.id} product={p} branchId={branch?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
