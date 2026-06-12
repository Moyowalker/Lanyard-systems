import Link from 'next/link';
import type { Paginated, ProductListItemDto } from '@lanyard/contracts';
import { apiFetch } from '@/lib/api';
import { getSelectedBranch } from '@/lib/branch';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

function EmptyShell({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: boolean;
}) {
  return (
    <div className="state-card flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-brand-100 text-brand-800">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <div>
        <div className="font-display text-2xl text-ink-950">{title}</div>
        <p className="mt-2 max-w-md text-sm leading-6 text-ink-700/80">{body}</p>
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
      <div className="space-y-6">
        <div className="surface-panel px-6 py-7 sm:px-8">
          <div className="page-eyebrow">Medicine search</div>
          <h1 className="page-title mt-3">Find medicines, dosages, and brands</h1>
        </div>
        <EmptyShell
          title="Start a search"
          body="Enter a medicine name, strength, or brand in the search bar above to see branch-aware results."
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
    <div className="space-y-6">
      <div className="surface-panel px-6 py-7 sm:px-8 sm:py-8">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(90%_100%_at_8%_0%,rgba(29,106,86,0.16),transparent_72%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="page-eyebrow">Search results</div>
            <h1 className="page-title mt-3">
              Results for <span className="text-brand-800">“{q}”</span>
            </h1>
            <p className="supporting-copy mt-3">
              {branch
                ? `Matched against the catalogue at ${branch.name}.`
                : 'Choose a branch to see local pricing and availability.'}
            </p>
          </div>
          <span className="tnum inline-flex w-fit items-center gap-2 rounded-full border border-paper-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-700/70 shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {count} {count === 1 ? 'match' : 'matches'}
          </span>
        </div>
      </div>

      {count === 0 ? (
        <EmptyShell
          title="No medicines matched"
          body={`We couldn't find anything for “${q}”. Check the spelling, try a generic name, or browse by category.`}
          cta
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.data.map((p) => (
            <ProductCard key={p.id} product={p} branchId={branch?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
