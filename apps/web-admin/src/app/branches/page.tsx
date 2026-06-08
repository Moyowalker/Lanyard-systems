'use client';

import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, Paginated } from '@lanyard/contracts';

import { IconAlert, IconBranch, IconCheck, IconOrders } from '@/components/icons';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';

function branchStatusTone(status?: string): 'success' | 'warn' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'neutral';
  if (status === 'SUSPENDED') return 'danger';
  return 'warn';
}

function humanizeToken(value?: string): string {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export default function BranchesPage() {
  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });

  const rows = branchesQ.data?.data ?? [];
  const activeCount = rows.filter((row) => row.status === 'ACTIVE').length;
  const deliveryCount = rows.filter((row) => row.fulfillment.delivery).length;

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Operational branch footprint and service availability"
        actions={
          <span className="text-sm text-slate-400">
            {rows.length} branch{rows.length === 1 ? '' : 'es'}
          </span>
        }
      />

      {branchesQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : branchesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load branches"
            description="The admin branch API is present, but the console had no route exposing it."
            icon={IconAlert}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches found"
            description="Seed or create a branch to start exposing inventory, pricing, and fulfilment operations."
            icon={IconBranch}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Registered branches" value={rows.length} icon={IconBranch} tone="brand" />
            <StatCard label="Active branches" value={activeCount} icon={IconCheck} tone="sky" />
            <StatCard label="Delivery enabled" value={deliveryCount} icon={IconOrders} tone="amber" />
          </div>

          <TableCard>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Branch</Th>
                <Th>Status</Th>
                <Th>Location</Th>
                <Th>Services</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.code}</div>
                  </Td>
                  <Td>
                    <Badge tone={branchStatusTone(row.status)}>{humanizeToken(row.status)}</Badge>
                  </Td>
                  <Td>
                    <div className="text-slate-700">{row.address.line1}</div>
                    <div className="text-xs text-slate-500">
                      {row.address.city}, {row.address.state}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={row.fulfillment.pickup ? 'info' : 'neutral'}>
                        {row.fulfillment.pickup ? 'Pickup' : 'No pickup'}
                      </Badge>
                      <Badge tone={row.fulfillment.delivery ? 'success' : 'neutral'}>
                        {row.fulfillment.delivery ? 'Delivery' : 'No delivery'}
                      </Badge>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      )}
    </div>
  );
}