'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { BranchSummaryDto } from '@lanyard/contracts';

export function BranchSelector({
  branches,
  selectedId,
}: {
  branches: BranchSummaryDto[];
  selectedId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative min-w-[14rem]">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-700"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
      <select
        aria-label="Select branch"
        defaultValue={selectedId}
        disabled={pending || branches.length === 0}
        onChange={async (e) => {
          await fetch('/api/branch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ branchId: e.target.value }),
          });
          startTransition(() => router.refresh());
        }}
        className="w-full cursor-pointer appearance-none rounded-xl border border-paper-200 bg-white py-2.5 pl-10 pr-9 text-sm font-medium text-ink-800 shadow-sm outline-none transition hover:border-brand-200 focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {branches.length === 0 && <option>No branches</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} — {b.address.city}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-700/50"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
