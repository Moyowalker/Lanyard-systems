import Link from 'next/link';
import { cookies } from 'next/headers';
import type { CategoryDto, Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';
import { listBranches, resolveBranch } from '@/lib/branch';
import { COOKIE } from '@/lib/config';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const branches = await listBranches().catch(() => []);
  const selected = resolveBranch(branches, (await cookies()).get(COOKIE.branch)?.value);
  const branchQuery = selected ? `?branchId=${selected.id}` : '';

  const [products, categories] = await Promise.all([
    apiFetch<Paginated<ProductListItemDto>>(`/catalog/products${branchQuery}`),
    apiFetch<{ data: CategoryDto[] }>(`/catalog/categories`),
  ]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 p-8 text-white">
        <h1 className="text-2xl font-bold sm:text-3xl">Your pharmacy, online.</h1>
        <p className="mt-2 max-w-xl text-brand-50">
          Browse medicines, upload a prescription, and choose pickup or delivery
          {selected ? ` from ${selected.name}, ${selected.address.city}.` : '.'}
        </p>
      </section>

      {categories.data.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.data.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-700"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          {selected ? `Available at ${selected.name}` : 'Products'}
        </h2>
        {products.data.length === 0 ? (
          <p className="text-gray-500">No products available at this branch yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.data.map((p) => (
              <ProductCard key={p.id} product={p} branchId={selected?.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
