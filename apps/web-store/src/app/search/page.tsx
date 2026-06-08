import type { Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';
import { getSelectedBranch } from '@/lib/branch';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  if (!q) return <p className="text-gray-500">Enter a search term above.</p>;

  const branch = await getSelectedBranch();
  const bq = branch ? `&branchId=${branch.id}` : '';
  const results = await apiFetch<Paginated<ProductListItemDto>>(
    `/catalog/search?q=${encodeURIComponent(q)}${bq}`,
  );

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-gray-900">
        Results for “{q}” {results.data.length > 0 && `(${results.data.length})`}
      </h1>
      {results.data.length === 0 ? (
        <p className="text-gray-500">No medicines matched your search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.data.map((p) => (
            <ProductCard key={p.id} product={p} branchId={branch?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
