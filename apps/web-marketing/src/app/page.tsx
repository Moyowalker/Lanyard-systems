import Image from 'next/image';
import Link from 'next/link';
import { StoreLink } from '@/components/StoreLink';
import { getMarketingBranches } from '@/lib/branches';
import { branchListJsonLd, marketingOrganizationJsonLd, marketingPageMetadata } from '@/lib/seo';

export const revalidate = 300;

export const metadata = marketingPageMetadata({
  title: 'Lanyard Pharmacy',
  description:
    'Genuine medicines, trusted pharmacists, and everyday wellness essentials from Lanyard Pharmacy in Lagos.',
  path: '/',
});

const services = [
  {
    number: '01',
    title: 'Everyday health',
    body: 'Medicines, vitamins, baby care, and wellness essentials in one place.',
  },
  {
    number: '02',
    title: 'Prescription care',
    body: 'Send your prescription securely for review by a licensed pharmacist.',
  },
  {
    number: '03',
    title: 'Pickup or delivery',
    body: 'Shop online, collect from our branch, or have your order delivered.',
  },
] as const;

export default async function HomePage() {
  const { items: branches } = await getMarketingBranches();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingOrganizationJsonLd(branches)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(branchListJsonLd(branches)) }}
      />

      <div className="space-y-16 pb-8 sm:space-y-24 sm:pb-12">
        <section className="relative -mx-4 -mt-8 min-h-[calc(100svh-4rem)] overflow-hidden bg-ink-950 sm:-mx-6 lg:-mx-8">
        <Image
          src="/lanyard-pharmacy-team-counter.png"
          alt="Lanyard pharmacists serving customers in the pharmacy"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[57%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,32,31,0.92)_0%,rgba(4,32,31,0.74)_38%,rgba(4,32,31,0.16)_72%,rgba(4,32,31,0.08)_100%)]" />

        <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl items-end px-4 pb-12 pt-28 sm:px-8 sm:pb-16 lg:items-center lg:px-12 lg:py-24">
          <div className="max-w-2xl rise-in">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">
              Your neighbourhood pharmacy
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] text-white sm:text-6xl lg:text-7xl">
              Care you can trust, close to home.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/80 sm:text-lg">
              Genuine medicines and personal support from pharmacists who know their community.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreLink
                source="home-hero-shop"
                className="cta-primary bg-white text-ink-900 hover:bg-brand-50"
              >
                Shop medicines
              </StoreLink>
              <StoreLink
                source="home-hero-rx"
                intent="prescription"
                className="cta-secondary border-white/35 bg-white/10 text-white backdrop-blur-sm hover:bg-white hover:text-ink-900"
              >
                Send a prescription
              </StoreLink>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 right-0 hidden border-l border-t border-white/20 bg-ink-950/80 px-7 py-5 text-white backdrop-blur-md md:block">
          <div className="text-xs uppercase tracking-[0.16em] text-white/55">Visit us</div>
          <div className="mt-1 font-semibold">86 Ago Palace Way, Lagos</div>
        </div>
      </section>

      <section className="grid gap-8 border-y border-paper-200 py-10 sm:grid-cols-3 sm:gap-6">
        {services.map((service) => (
          <article key={service.title} className="flex gap-4 sm:block">
            <span className="text-sm font-bold text-brand-600">{service.number}</span>
            <div className="sm:mt-5">
              <h2 className="text-xl font-semibold text-ink-900">{service.title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-900/65">{service.body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="grid items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
        <div className="relative aspect-[4/3] overflow-hidden bg-paper-100">
          <Image
            src="/lanyard-pharmacy-team-shelves.png"
            alt="Lanyard pharmacists checking medicines on well-stocked shelves"
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover"
          />
        </div>

        <div className="max-w-xl">
          <p className="eyebrow">More than a pharmacy</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-ink-900 sm:text-5xl">
            People first. Always.
          </h2>
          <p className="mt-5 text-base leading-7 text-ink-900/70">
            We make quality healthcare easier to reach with genuine products, clear guidance, and
            friendly professionals ready to help.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/about" className="cta-primary">
              About Lanyard
            </Link>
            <Link href="/services" className="cta-secondary">
              Our services
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-brand-50 px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
        <div className="flex flex-col gap-5 border-b border-brand-100 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Find us in Lagos</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink-900 sm:text-4xl">Your local Lanyard.</h2>
          </div>
          <Link href="/branches" className="text-sm font-semibold text-brand-700 hover:text-brand-900">
            See all branch details →
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {branches.slice(0, 2).map((branch) => (
            <article key={branch.id} className="border-l-2 border-brand-600 pl-5">
              <h3 className="text-lg font-semibold text-ink-900">{branch.name}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-900/65">
                {branch.address.line1}, {branch.address.city}
              </p>
              <StoreLink
                source="home-branch-shop"
                branchId={branch.id}
                className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900"
              >
                Shop this branch →
              </StoreLink>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-8 bg-ink-900 px-6 py-12 text-white sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-14 lg:py-16">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-200">
            Ready when you are
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Healthcare without the hassle.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/70">
            Order essentials or send your prescription in a few simple steps.
          </p>
        </div>
        <div className="flex-none">
            <StoreLink
              source="home-final-shop"
              className="cta-primary bg-white text-ink-900 hover:bg-brand-50"
            >
              Start shopping
            </StoreLink>
        </div>
        </section>
      </div>
    </>
  );
}