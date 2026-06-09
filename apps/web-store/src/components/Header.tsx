import Link from 'next/link';
import { cookies } from 'next/headers';
import { listBranches, resolveBranch } from '@/lib/branch';
import { COOKIE } from '@/lib/config';
import { BranchSelector } from './BranchSelector';
import { SearchBar } from './SearchBar';
import { AccountMenu } from './AccountMenu';
import { CartLink } from './CartLink';

export async function Header() {
  const branches = await listBranches().catch(() => []);
  const selected = resolveBranch(branches, (await cookies()).get(COOKIE.branch)?.value);

  return (
    <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <div className="surface-panel px-4 py-3.5 backdrop-blur-sm sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center justify-between gap-3 lg:min-w-[17rem]">
              <Link href="/" className="group inline-flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-brand-700 text-white shadow-[0_10px_22px_-12px_rgba(11,33,28,0.8)] transition group-hover:bg-brand-800"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                    <path
                      d="M12 3.5v17M3.5 12h17"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
                    Trusted pharmacy
                  </span>
                  <span className="mt-1 font-display text-[1.35rem] tracking-[-0.01em] text-ink-950 transition group-hover:text-brand-800">
                    Lanyard
                  </span>
                </span>
              </Link>
              {selected ? (
                <div className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-brand-800 sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {selected.address.city}
                </div>
              ) : null}
            </div>
            <div className="order-3 w-full lg:order-2 lg:flex-1">
              <SearchBar />
            </div>
            <div className="order-2 flex flex-wrap items-center gap-2 lg:order-3 lg:justify-end">
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
