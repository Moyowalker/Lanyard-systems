'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe, useLogout } from '@/lib/client';

export function AccountMenu() {
  const { data: me, isLoading } = useMe();
  const logout = useLogout();
  const router = useRouter();

  if (isLoading) return <div className="h-10 w-24 animate-pulse rounded-xl bg-paper-100" />;

  if (!me) {
    return (
      <Link href="/account/login" className="soft-button">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href="/orders" className="soft-button">
        Orders
      </Link>
      <span className="hidden items-center gap-2 rounded-xl border border-paper-200 bg-white px-4 py-2.5 text-sm text-ink-800 sm:inline-flex">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[0.72rem] font-bold uppercase text-brand-800">
          {(me.profile.firstName ?? 'L').charAt(0)}
        </span>
        Hi, {me.profile.firstName ?? 'there'}
      </span>
      <button
        onClick={() => logout.mutate(undefined, { onSuccess: () => router.refresh() })}
        className="soft-button"
      >
        Sign out
      </button>
    </div>
  );
}
