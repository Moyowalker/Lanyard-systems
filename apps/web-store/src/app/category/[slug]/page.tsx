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

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold capitalize text-gray-900">
        {slug.replace(/-/g, ' ')}
      </h1>
      {products.data.length === 0 ? (
        <p className="text-gray-500">No products in this category at your branch.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.data.map((p) => (
            <ProductCard key={p.id} product={p} branchId={branch?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
