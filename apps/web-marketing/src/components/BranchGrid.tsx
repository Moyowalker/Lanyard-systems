import type { BranchSummaryDto } from '@lanyard/contracts';

function ServiceBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? 'pill bg-brand-50 text-brand-800' : 'pill bg-slate-100 text-slate-500'}>
      {label}
    </span>
  );
}

export function BranchGrid({
  branches,
  isLive,
}: {
  branches: BranchSummaryDto[];
  isLive: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-700/70">
        <span className={isLive ? 'pill bg-brand-100 text-brand-800' : 'pill bg-sand-100 text-ink-800'}>
          {isLive ? 'Live branch feed' : 'Preview branch feed'}
        </span>
        <span>
          {isLive
            ? 'Showing branch data from the running API.'
            : 'Showing fallback locations while the branch API is unavailable.'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((branch) => (
          <article key={branch.id} className="surface-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="pill bg-brand-50 text-brand-800">{branch.code}</div>
                <h3 className="mt-4 font-display text-2xl text-ink-900">{branch.name}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-700/75">
                  {branch.address.line1}, {branch.address.city}, {branch.address.state}
                </p>
              </div>
              <span className="pill bg-ink-900 text-white/90">{branch.status.replace(/_/g, ' ')}</span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <ServiceBadge active={branch.fulfillment.pickup} label="Pickup" />
              <ServiceBadge active={branch.fulfillment.delivery} label="Delivery" />
              {branch.distanceKm != null ? (
                <span className="pill bg-slate-100 text-slate-600">
                  {branch.distanceKm.toFixed(1)} km away
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
