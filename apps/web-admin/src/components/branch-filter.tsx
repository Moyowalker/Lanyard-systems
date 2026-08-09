'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, MeResponse, Paginated } from '@lanyard/contracts';

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-brand-500';

export function useOperationalBranchFilter() {
  const [branchId, setBranchId] = useState('');
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await fetch('/api/me');
      return response.ok ? ((await response.json()) as MeResponse) : null;
    },
  });
  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'operational-filter'],
    queryFn: async () => {
      const response = await fetch('/api/admin/branches/available?limit=100');
      return response.ok ? ((await response.json()) as Paginated<BranchSummaryDto>) : null;
    },
  });

  const scope = meQ.data?.branchScope ?? [];
  const canViewAllBranches = scope.includes('ALL');
  const branches = (branchesQ.data?.data ?? []).filter(
    (branch) => canViewAllBranches || scope.includes(branch.id),
  );

  useEffect(() => {
    if (canViewAllBranches) {
      if (branchId && !branches.some((branch) => branch.id === branchId)) setBranchId('');
      return;
    }
    if (!branches.some((branch) => branch.id === branchId)) setBranchId(branches[0]?.id ?? '');
  }, [branchId, branches, canViewAllBranches]);

  return { branchId, setBranchId, branches, canViewAllBranches, isLoading: meQ.isLoading || branchesQ.isLoading };
}

export function BranchFilter({
  branchId,
  onChange,
  branches,
  canViewAllBranches,
}: {
  branchId: string;
  onChange: (branchId: string) => void;
  branches: BranchSummaryDto[];
  canViewAllBranches: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span>Branch</span>
      <select
        value={branchId}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
        aria-label="Filter by branch"
      >
        {canViewAllBranches ? <option value="">All branches</option> : null}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}