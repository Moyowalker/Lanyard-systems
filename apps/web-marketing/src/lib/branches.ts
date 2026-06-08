import type { BranchSummaryDto } from '@lanyard/contracts';
import { apiTry } from './api';
import { fallbackBranches } from './content';

export async function getMarketingBranches(): Promise<{
  items: BranchSummaryDto[];
  isLive: boolean;
}> {
  const res = await apiTry<{ data: BranchSummaryDto[] }>('/branches', {
    next: { revalidate: 300 },
  });

  if (res?.data?.length) {
    return { items: res.data, isLive: true };
  }

  return { items: fallbackBranches, isLive: false };
}
