import { cookies } from 'next/headers';
import type { BranchSummaryDto } from '@lanyard/contracts';
import { apiFetch } from './api';
import { COOKIE } from './config';

export async function listBranches(): Promise<BranchSummaryDto[]> {
  const res = await apiFetch<{ data: BranchSummaryDto[] }>('/branches');
  return res.data;
}

/** The customer's chosen branch (cookie), falling back to the first active branch. */
export function resolveBranch(
  branches: BranchSummaryDto[],
  cookieId?: string,
): BranchSummaryDto | undefined {
  return branches.find((b) => b.id === cookieId) ?? branches[0];
}

export async function getSelectedBranch(): Promise<BranchSummaryDto | undefined> {
  const branches = await listBranches();
  const cookieId = (await cookies()).get(COOKIE.branch)?.value;
  return resolveBranch(branches, cookieId);
}
