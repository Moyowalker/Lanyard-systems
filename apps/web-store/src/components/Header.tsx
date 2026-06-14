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
    <header className="sticky top-0 z-40 border-b border-paper-200 bg-white">
      {/* Slim trust strip — desktop only */}
      <div className="hidden border-b border-paper-100 bg-paper-50 lg:block">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-1.5 text-[0.72rem] font-medium text-ink-900/65 lg:px-8">
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Licensed pharmacists
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> NAFDAC-registered medicines
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Branch-aware pricing &
              stock
            </span>
          </div>
          <div className="flex items-center gap-4">
            {supportContact.phoneHref ? (
              <a href={supportContact.phoneHref} className="hover:text-brand-700">
                {supportContact.phoneDisplay}
              </a>
            ) : null}
            <span>{supportContact.hours}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-3">
          <Link href="/" className="group inline-flex flex-none items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white transition group-hover:bg-brand-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <path
                  d="M12 4v16M4 12h16"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[1.15rem] font-semibold tracking-[-0.01em] text-ink-900">
                Lanyard
              </span>
              <span className="mt-0.5 hidden text-[0.7rem] font-medium text-ink-900/55 sm:block">
                Pharmacy
              </span>
            </span>
          </Link>

          {/* Desktop search */}
          <div className="hidden flex-1 lg:block">
            <SearchBar />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <BranchSelector branches={branches} selectedId={selected?.id} />
            <AccountMenu />
            <CartLink />
          </div>
        </div>

        {/* Mobile search */}
        <div className="pb-3 lg:hidden">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
