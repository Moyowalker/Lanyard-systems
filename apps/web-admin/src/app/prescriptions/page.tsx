'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, PrescriptionDto } from '@lanyard/contracts';
import { rxTone, timeAgo } from '@/lib/format';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { IconCheck, IconChevronRight, IconRx, IconShield } from '@/components/icons';

export default function PrescriptionQueue() {
  const { data, isLoading } = useQuery({
    queryKey: ['rx-queue'],
    queryFn: async () => {
      const r = await fetch('/api/admin/prescriptions?status=pending');
      return r.ok ? ((await r.json()) as Paginated<PrescriptionDto>) : null;
    },
    refetchInterval: 10000,
  });

  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Prescription queue"
        subtitle="Verify prescriptions before dispensing — every access is audited (PCN / NDPA)"
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
            <IconShield width={14} height={14} /> Compliance-controlled
          </span>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Queue is clear"
            description="No prescriptions are awaiting verification right now."
            icon={IconCheck}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((rx) => {
            const clean = rx.files.every((f) => f.avScan === 'clean');
            return (
              <li key={rx.id}>
                <Link
                  href={`/prescriptions/${rx.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card-raised transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-card-hover"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-inset ring-brand-600/10">
                    <IconRx width={22} height={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">Rx {rx.id.slice(-6)}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {rx.files.length} file{rx.files.length === 1 ? '' : 's'} · {timeAgo(rx.createdAt)}
                    </div>
                  </div>
                  <Badge tone={clean ? 'success' : 'warn'}>
                    {clean ? 'Scan clean' : 'Scan pending'}
                  </Badge>
                  <Badge tone={rxTone(rx.status)}>{rx.status}</Badge>
                  <IconChevronRight
                    width={18}
                    height={18}
                    className="text-slate-300 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
