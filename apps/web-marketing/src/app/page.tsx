import Link from 'next/link';
import { BranchGrid } from '@/components/BranchGrid';
import { SectionTitle } from '@/components/SectionTitle';
import { StoreLink } from '@/components/StoreLink';
import { getMarketingBranches } from '@/lib/branches';
import { faqs, heroStats, principles, serviceTracks } from '@/lib/content';
import { branchListJsonLd, marketingOrganizationJsonLd } from '@/lib/seo';

export const revalidate = 300;

export default async function HomePage() {
  const { items: branches, isLive } = await getMarketingBranches();
  const branchLead = branches[0];

  return (
    <div className="space-y-20 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(marketingOrganizationJsonLd(branches)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(branchListJsonLd(branches)) }}
      />

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
        <div className="hero-shell p-8 sm:p-10 lg:p-12">
          <div className="eyebrow">Pharmacy brand and digital storefront</div>
          <h1 className="mt-5 max-w-3xl font-display text-5xl leading-none text-ink-900 sm:text-6xl lg:text-7xl">
            Care that feels human before it feels transactional.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-700/80 sm:text-xl">
            Lanyard pairs a warm public-facing brand with a real branch-aware pharmacy store,
            pharmacist verification, and a sharper handoff into fulfillment.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <StoreLink source="home-hero-shop" className="cta-primary">
              Start shopping
            </StoreLink>
            <StoreLink source="home-hero-rx" intent="prescription" className="cta-secondary">
              Start with a prescription
            </StoreLink>
            <Link href="/branches" className="cta-secondary">
              Explore branches
            </Link>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-700/75">
            Prescription uploads happen inside the storefront checkout flow after medicine
            selection, with pharmacist verification controlling the next step before fulfilment.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {heroStats.map((stat) => (
              <div key={stat.value} className="metric-card">
                <div className="font-display text-3xl text-ink-900">{stat.value}</div>
                <p className="mt-2 text-sm leading-6 text-ink-700/75">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mesh-panel relative overflow-hidden rounded-[38px] p-6 text-white shadow-glow sm:p-8">
          <div className="pill bg-white/15 text-white">Designed for trust</div>
          <div className="mt-6 space-y-4">
            <article className="rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-white/60">
                Prescription lane
              </div>
              <h2 className="mt-3 font-display text-3xl">
                Verification is built into the experience.
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/80">
                Prescription uploads route into the staff console, where pharmacist review and
                auditability sit behind a cleaner customer-facing flow.
              </p>
            </article>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-[24px] bg-white/12 p-5 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-[0.24em] text-white/55">
                  Branch-aware
                </div>
                <div className="mt-3 font-display text-2xl">
                  {branches.length} locations surfaced
                </div>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  {branchLead
                    ? `Lead branch right now: ${branchLead.name}, ${branchLead.address.city}.`
                    : 'Branch discovery ready for launch.'}
                </p>
              </article>
              <article className="rounded-[24px] bg-white/12 p-5 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-[0.24em] text-white/55">
                  Store handoff
                </div>
                <div className="mt-3 font-display text-2xl">From marketing to conversion</div>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  The site sets tone, answers objections, and then hands customers into a live
                  commerce flow without feeling like a template.
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card p-6 sm:p-8">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            'Pickup-ready workflows',
            'Prescription-first checkout',
            'Branch-level availability',
            'Compliance-conscious design',
          ].map((item) => (
            <div
              key={item}
              className="rounded-[22px] border border-slate-200/70 bg-white/70 px-4 py-4 text-sm font-medium text-ink-800 shadow-card"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Core services"
          title="Built to sell medicine without looking like generic healthcare software."
          copy="The marketing layer should feel premium and composed, while still explaining the real operational strengths underneath the product."
          action={
            <Link href="/services" className="cta-secondary">
              View all services
            </Link>
          }
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {serviceTracks.map((service, index) => (
            <article key={service.title} className="surface-card p-7">
              <div className="pill bg-brand-50 text-brand-800">0{index + 1}</div>
              <h3 className="mt-5 font-display text-2xl text-ink-900">{service.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-700/75">{service.body}</p>
              <ul className="mt-6 space-y-3 text-sm text-ink-800/80">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-brand-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Why it lands"
          title="The design direction is deliberate: warmer, calmer, and more premium than the current storefront."
          copy="A marketing site should reduce friction before checkout even starts. That means better hierarchy, stronger storytelling, and a visual system that customers remember."
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {principles.map((principle) => (
            <article key={principle.title} className="surface-card p-6">
              <h3 className="font-display text-2xl text-ink-900">{principle.title}</h3>
              <p className="mt-4 text-sm leading-7 text-ink-700/80">{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Branch discovery"
          title="Branch locations should feel useful, not buried."
          copy="The public site can make branch selection intuitive before customers ever reach the store. This keeps the conversion path cleaner once they are ready to buy."
          action={
            <Link href="/branches" className="cta-secondary">
              Open branch guide
            </Link>
          }
        />
        <BranchGrid branches={branches} isLive={isLive} />
      </section>

      <section>
        <SectionTitle
          eyebrow="FAQ preview"
          title="Answer the questions that usually block conversion."
          copy="A better public-facing site should handle confidence-building upfront: prescriptions, branch pricing, delivery, and what makes the platform safe to use."
          action={
            <Link href="/faq" className="cta-secondary">
              Read all FAQs
            </Link>
          }
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {faqs.slice(0, 3).map((faq) => (
            <article key={faq.question} className="surface-card p-6">
              <h3 className="font-display text-2xl text-ink-900">{faq.question}</h3>
              <p className="mt-4 text-sm leading-7 text-ink-700/80">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mesh-panel overflow-hidden rounded-[38px] p-8 text-white shadow-glow sm:p-10">
        <div className="max-w-3xl">
          <div className="eyebrow text-brand-100">Ready to ship publicly</div>
          <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
            Give Lanyard a proper front door, then let the store do the conversion work.
          </h2>
          <p className="mt-4 text-base leading-8 text-white/80 sm:text-lg">
            This site exists to attract, reassure, and direct. The store exists to convert. The
            admin console exists to fulfill safely. That split is what makes the overall product
            feel intentional.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <StoreLink
              source="home-final-shop"
              className="cta-primary bg-white text-ink-900 hover:bg-sand-100"
            >
              Enter the store
            </StoreLink>
            <StoreLink
              source="home-final-rx"
              intent="prescription"
              className="cta-secondary border-white/20 text-white hover:bg-white/10"
            >
              Start a prescription order
            </StoreLink>
            <Link
              href="/contact"
              className="cta-secondary border-white/20 text-white hover:bg-white/10"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
