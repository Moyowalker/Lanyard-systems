import type { Metadata } from 'next';
import { BranchGrid } from '@/components/BranchGrid';
import { SectionTitle } from '@/components/SectionTitle';
import { getMarketingBranches } from '@/lib/branches';
import { branchListJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Branches',
  description: 'Discover Lanyard branch locations and available fulfillment services.',
};

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  const { items: branches, isLive } = await getMarketingBranches();

  return (
    <div className="space-y-16 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(branchListJsonLd(branches)) }}
      />

      <section className="hero-shell p-8 sm:p-10 lg:p-12">
        <div className="eyebrow">Branch guide</div>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl">
          Make branch choice feel like part of the experience, not a hidden setting.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-700/80">
          Branches shape availability, pricing, pickup readiness, and delivery options. The public
          site should surface that clearly before the customer enters the store flow.
        </p>
      </section>

      <section>
        <SectionTitle
          eyebrow="Live locations"
          title="A sharper branch page gives the store a cleaner starting point."
          copy="This page can be both a branch discovery surface and a conversion bridge into the commerce app."
        />
        <BranchGrid branches={branches} isLive={isLive} />
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {[
          [
            'Pickup',
            'Perfect for customers who already know what they need and want branch-level certainty.',
          ],
          [
            'Delivery',
            'Useful for customers who need convenience, especially once branch eligibility is clear.',
          ],
          [
            'Prescription support',
            'The branch page should reassure customers that regulated medicines are handled through review, not shortcuts.',
          ],
        ].map(([title, body]) => (
          <article key={title} className="surface-card p-6">
            <h2 className="font-display text-3xl text-ink-900">{title}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-700/80">{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
