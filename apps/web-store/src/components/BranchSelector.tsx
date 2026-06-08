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
      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
    >
      {branches.length === 0 && <option>No branches</option>}
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} — {b.address.city}
        </option>
      ))}
    </select>
  );
}
