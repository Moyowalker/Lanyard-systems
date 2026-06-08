'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe, useLogout } from '@/lib/client';

export function AccountMenu() {
  const { data: me, isLoading } = useMe();
  const logout = useLogout();
  const router = useRouter();

  if (isLoading) return <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />;

  if (!me) {
    return (
      <Link href="/account/login" className="text-sm font-medium text-brand-700 hover:underline">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/orders" className="font-medium text-gray-600 hover:text-brand-700">
        Orders
      </Link>
      <span className="hidden text-gray-600 sm:inline">Hi, {me.profile.firstName ?? 'there'}</span>
      <button
        onClick={() => logout.mutate(undefined, { onSuccess: () => router.refresh() })}
        className="font-medium text-gray-500 hover:text-gray-900"
      >
        Sign out
      </button>
    </div>
  );
}
