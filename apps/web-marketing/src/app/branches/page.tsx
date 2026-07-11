import type { Metadata } from 'next';
import { BranchGrid } from '@/components/BranchGrid';
import { SectionTitle } from '@/components/SectionTitle';
import { getMarketingBranches } from '@/lib/branches';
import { branchListJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Branches',
  description:
    'Find a Lanyard Pharmacy branch near you for medicine delivery, pickup, and prescription support.',
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
        <div className="eyebrow">Find a branch</div>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl">
          Choose the Lanyard branch closest to you.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-700/80">
          Your branch helps us show the right stock, prices, pickup options, and delivery details
          before you place an order.
        </p>
      </section>

      <section>
        <SectionTitle
          eyebrow="Live locations"
          title="Find medicine from a branch you can actually visit."
          copy="Choose a branch, check what is available, then order for delivery or pickup."
        />
        <BranchGrid branches={branches} isLive={isLive} />
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {[
          ['Pickup', 'Reserve online and collect from the branch when your order is ready.'],
          [
            'Delivery',
            'Get your medicine delivered from a nearby branch when delivery is available.',
          ],
          [
            'Prescription support',
            'Prescription medicines are checked by a licensed pharmacist before they are prepared.',
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
