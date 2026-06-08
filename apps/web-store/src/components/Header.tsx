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
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-700">
          Lanyard<span className="text-gray-400"> Pharmacy</span>
        </Link>
        <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
          <SearchBar />
        </div>
        <div className="order-2 ml-auto flex items-center gap-3 sm:order-3">
          <BranchSelector branches={branches} selectedId={selected?.id} />
          <AccountMenu />
          <CartLink />
        </div>
      </div>
    </header>
  );
}
