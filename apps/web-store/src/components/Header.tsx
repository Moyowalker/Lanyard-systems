import Link from 'next/link';
import { cookies } from 'next/headers';
import { listBranches, resolveBranch } from '@/lib/branch';
import { COOKIE } from '@/lib/config';
import { BranchSelector } from './BranchSelector';
import { SearchBar } from './SearchBar';
import { AccountMenu } from './AccountMenu';
import { CartLink } from './CartLink';
import { supportContact } from '@/lib/support';

export async function Header() {
  const branches = await listBranches().catch(() => []);
  const selected = resolveBranch(branches, (await cookies()).get(COOKIE.branch)?.value);

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px] space-y-3">
        <div className="hidden items-center justify-between rounded-[1.35rem] border border-white/75 bg-white/[0.72] px-5 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-700/72 shadow-card backdrop-blur-xl lg:flex">
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Licensed pharmacists
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-seal-300" />
              Prescription checks before release
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
              Branch-based pricing and stock
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {supportContact.whatsappUrl ? (
              <a
                href={supportContact.whatsappUrl}
                className="inline-flex items-center gap-2 rounded-full bg-seal-100/80 px-3 py-1 text-ink-800 transition hover:bg-seal-200/70"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-seal-400" />
                WhatsApp support
              </a>
            ) : null}
            {supportContact.phoneHref ? (
              <a
                href={supportContact.phoneHref}
                className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-ink-800 transition hover:bg-brand-50"
              >
                {supportContact.phoneDisplay}
              </a>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-white/75 px-3 py-1 text-ink-800">
              {supportContact.hours}
            </span>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50/80 px-3 py-1 text-brand-800">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {selected
                ? `Viewing catalogue for ${selected.name}`
                : 'Choose a branch to unlock local pricing and stock'}
            </div>
          </div>
        </div>

        <div className="surface-panel px-4 py-4 sm:px-5 sm:py-5">
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(72%_100%_at_8%_0%,rgba(29,106,86,0.18),transparent_72%)]" />
          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex items-center justify-between gap-4 xl:min-w-[21rem]">
              <Link href="/" className="group inline-flex items-center gap-3.5">
                <span
                  aria-hidden="true"
                  className="relative flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-[1.35rem] bg-ink-950 text-white shadow-[0_18px_36px_-22px_rgba(11,33,28,0.9)] transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-brand-800"
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.32),transparent_42%)]" />
                  <svg
                    viewBox="0 0 24 24"
                    className="relative h-5 w-5"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3.5v17M3.5 12h17"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-brand-700">
                    Lanyard Pharmacy
                  </span>
                  <span className="mt-1 font-display text-[1.5rem] tracking-[-0.02em] text-ink-950 transition group-hover:text-brand-800">
                    Care you can verify
                  </span>
                  <span className="mt-1 hidden text-xs text-ink-700/68 lg:block">
                    Professional medicine discovery with branch-aware fulfilment.
                  </span>
                </span>
              </Link>
              {selected ? (
                <div className="hidden items-center gap-2 rounded-full border border-brand-200 bg-brand-50/85 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-brand-800 md:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {selected.address.city}
                </div>
              ) : null}
            </div>

            <div className="order-3 w-full xl:order-2 xl:flex-1">
              <SearchBar />
            </div>

            <div className="order-2 flex flex-wrap items-center gap-2 xl:order-3 xl:justify-end">
              <BranchSelector branches={branches} selectedId={selected?.id} />
              <AccountMenu />
              <CartLink />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
