'use client';

import { useQuery } from '@tanstack/react-query';
import type { LeadSummaryDto } from '@lanyard/contracts';

import {
  IconAlert,
  IconBell,
  IconBranch,
  IconCheck,
  IconClock,
} from '@/components/icons';
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

type LeadListResponse = { data: LeadSummaryDto[] };

function humanizeToken(value?: string): string {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split(/[_-]/)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function relativeTime(iso: string): string {
  const value = new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.round((Date.now() - value) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function statusTone(status?: string): 'success' | 'warn' | 'neutral' {
  if (status === 'contacted') return 'success';
  if (status === 'new') return 'warn';
  return 'neutral';
}

export default function LeadsPage() {
  const leadsQ = useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const res = await fetch('/api/admin/leads?limit=100');
      if (!res.ok) throw new Error('Failed to load leads');
      return (await res.json()) as LeadListResponse;
    },
  });

  const rows = leadsQ.data?.data ?? [];
  const newCount = rows.filter((row) => row.status === 'new').length;
  const withEmailCount = rows.filter((row) => row.email).length;
  const withBranchCount = rows.filter((row) => row.branch).length;

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Marketing enquiries captured from the public site contact flow"
        actions={
          <span className="text-sm text-slate-400">
            {rows.length} lead{rows.length === 1 ? '' : 's'}
          </span>
        }
      />

      {leadsQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : leadsQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load leads"
            description="The lead capture path is enabled, but the admin inbox could not reach its API endpoint."
            icon={IconAlert}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No leads captured yet"
            description="New public-site enquiries will appear here once customers use the marketing contact form."
            icon={IconBell}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Captured leads" value={rows.length} icon={IconBell} tone="brand" />
            <StatCard label="New" value={newCount} icon={IconClock} tone="amber" />
            <StatCard label="With email" value={withEmailCount} icon={IconCheck} tone="sky" />
            <StatCard label="Branch tagged" value={withBranchCount} icon={IconBranch} tone="rose" />
          </div>

          <TableCard>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Contact</Th>
                <Th>Topic</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">
                      {[row.email, row.phone, row.branch].filter(Boolean).join(' · ') ||
                        'No secondary details'}
                    </div>
                    {row.message ? (
                      <div className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
                        {row.message}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{row.topic ? humanizeToken(row.topic) : 'General enquiry'}</Td>
                  <Td>{humanizeToken(row.source)}</Td>
                  <Td>
                    <Badge tone={statusTone(row.status)}>{humanizeToken(row.status)}</Badge>
                  </Td>
                  <Td>
                    <div className="text-slate-700">{relativeTime(row.createdAt)}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(row.createdAt).toLocaleString()}
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