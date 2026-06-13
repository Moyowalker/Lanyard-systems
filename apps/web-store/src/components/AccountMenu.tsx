'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe, useLogout } from '@/lib/client';

export function AccountMenu() {
  const { data: me, isLoading } = useMe();
  const logout = useLogout();
  const router = useRouter();
  const firstName = me?.profile.firstName ?? 'there';
  const initial = firstName.charAt(0).toUpperCase() || 'L';

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-[3.15rem] w-28 animate-pulse rounded-[1.15rem] bg-white/80 shadow-card" />
        <div className="hidden h-[3.15rem] w-36 animate-pulse rounded-[1.15rem] bg-white/80 shadow-card sm:block" />
      </div>
    );
  }

  if (!me) {
    return (
      <Link href="/account/login" className="soft-button">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-brand-700"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" />
        </svg>
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href="/orders" className="soft-button">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-brand-700"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path d="M8 7h10M8 12h10M8 17h10" strokeLinecap="round" />
          <path d="M4 7h.01M4 12h.01M4 17h.01" strokeLinecap="round" />
        </svg>
        Orders
      </Link>
      <Link href="/account/profile" className="soft-button">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 text-brand-700"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" strokeLinecap="round" />
        </svg>
        Account
      </Link>
      <span className="hidden min-h-[3.15rem] items-center gap-3 rounded-[1.2rem] border border-paper-200/90 bg-white/[0.92] px-4 py-2.5 text-sm text-ink-800 shadow-card backdrop-blur-sm md:inline-flex">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-[0.78rem] font-bold uppercase text-brand-800">
          {initial}
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-700/52">
            Signed in
          </span>
          <span className="mt-1 font-semibold text-ink-950">Hi, {firstName}</span>
        </span>
      </span>
      <button
        onClick={() => logout.mutate(undefined, { onSuccess: () => router.refresh() })}
        disabled={logout.isPending}
        className="soft-button bg-paper-50/85 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {logout.isPending ? 'Signing out' : 'Sign out'}
      </button>
    </div>
  );
}
