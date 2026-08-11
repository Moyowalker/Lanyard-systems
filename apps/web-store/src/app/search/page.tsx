import Link from 'next/link';
import type { Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';
import { getSelectedBranch } from '@/lib/branch';
import { PaginatedProductGrid } from '@/components/PaginatedProductGrid';

export const dynamic = 'force-dynamic';

function EmptyShell({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  return (
    <div className="state-card flex flex-col items-center gap-3 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </span>
      <div>
        <div className="text-base font-semibold text-ink-900">{title}</div>
        <p className="mt-1.5 max-w-md text-sm text-ink-900/70">{body}</p>
      </div>
      {cta ? (
        <Link href="/" className="secondary-button">
          Browse the catalogue
        </Link>
      ) : null}
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  if (!q) {
    return (
      <div className="space-y-5">
        <div>
          <div className="page-eyebrow">Medicine search</div>
          <h1 className="page-title mt-2">Find medicines, dosages, and brands</h1>
        </div>
        <EmptyShell
          title="Start a search"
          body="Use the search bar above to find a medicine by name, strength, or brand — results are branch-aware."
          cta
        />
      </div>
    );
  }

  const branch = await getSelectedBranch();
  const bq = branch ? `&branchId=${branch.id}` : '';
  const results = await apiFetch<Paginated<ProductListItemDto>>(
    `/catalog/search?q=${encodeURIComponent(q)}${bq}`,
  );
  const count = results.data.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="page-eyebrow">Search results</div>
          <h1 className="page-title mt-2">
            Results for <span className="text-brand-700">“{q}”</span>
          </h1>
          <p className="mt-1.5 text-sm text-ink-900/60">
            {branch ? `Matched at ${branch.name}.` : 'Choose a branch for local pricing and stock.'}
          </p>
        </div>
        <span className="ghost-pill">
          {count} {count === 1 ? 'match' : 'matches'}
        </span>
      </div>

      {count === 0 ? (
        <EmptyShell
          title="No medicines matched"
          body={`We couldn't find anything for “${q}”. Check the spelling, try a generic name, or browse by category.`}
          cta
        />
      ) : (
        <PaginatedProductGrid
          initialPage={results}
          branchId={branch?.id}
          endpoint="/api/catalog/search"
          params={{ q }}
        />
      )}
    </div>
  );
}
