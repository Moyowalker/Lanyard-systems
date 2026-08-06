import Link from 'next/link';
import type { CategoryDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

const CATEGORY_SPOTLIGHTS = [
  'antimalarial',
  'antibiotics',
  'analgesics',
  'antidiabetics',
  'antihypertensives',
  'cold-flu',
  'supplements',
  'diagnostics',
];

function CategoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="8.5" y="7.5" width="12" height="6" rx="3" transform="rotate(-30 20.5 13.5)" />
      <path d="M4 10h6M4 14h4" strokeLinecap="round" />
    </svg>
  );
}

export default async function CategoriesPage() {
  const response = await apiFetch<{ data: CategoryDto[] }>('/catalog/categories');
  const categories = [...response.data].sort((left, right) => {
    const leftPriority = CATEGORY_SPOTLIGHTS.indexOf(left.slug);
    const rightPriority = CATEGORY_SPOTLIGHTS.indexOf(right.slug);
    if (leftPriority !== -1 || rightPriority !== -1) {
      return (leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority) -
        (rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority);
    }
    return left.name.localeCompare(right.name);
  });

  return (
    <div className="space-y-6">
      <div className="surface-panel-dark px-5 py-6 sm:px-7">
        <div className="section-kicker !text-brand-100">Catalogue</div>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Browse by category</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
          Start with a therapy area, then see medicines priced for your selected branch.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/category/${category.slug}`}
            className="group flex min-h-[9rem] flex-col justify-between rounded-xl border border-paper-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-card"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-brand-100">
              <CategoryIcon />
            </span>
            <span className="text-sm font-semibold leading-snug text-ink-900">{category.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}