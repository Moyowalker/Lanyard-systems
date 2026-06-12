'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { MeResponse, OrderDto, Paginated, PrescriptionDto } from '@lanyard/contracts';
import { deriveMetrics } from '@/lib/metrics';
import { personaFor, PERSONA_FOCUS, type Persona } from '@/lib/roles';
import { formatKobo, label, statusTone, timeAgo } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyState,
  Panel,
  Skeleton,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';
import { Bars, ColumnChart, Donut } from '@/components/charts';
import {
  IconAlert,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconOrders,
  IconRx,
} from '@/components/icons';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const r = await fetch('/api/me');
      return r.ok ? ((await r.json()) as MeResponse) : null;
    },
  });

  const ordersQ = useQuery({
    queryKey: ['admin-orders', 'all'],
    queryFn: async () => {
      const r = await fetch('/api/admin/orders?limit=100');
      return r.ok ? ((await r.json()) as Paginated<OrderDto>) : null;
    },
    refetchInterval: 15000,
  });

  const rxQ = useQuery({
    queryKey: ['rx-queue', 'count'],
    queryFn: async () => {
      const r = await fetch('/api/admin/prescriptions?status=pending');
      return r.ok ? ((await r.json()) as Paginated<PrescriptionDto>) : null;
    },
    refetchInterval: 15000,
  });

  const persona: Persona = personaFor(me.data?.roles ?? []);
  const orders = ordersQ.data?.data ?? [];
  const m = deriveMetrics(orders);
  const pendingRx = rxQ.data?.data?.length ?? 0;
  const firstName = me.data?.profile.firstName ?? 'there';
  const loading = ordersQ.isLoading || me.isLoading;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 px-6 py-6 text-white shadow-card-raised sm:px-7">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live operations
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-[1.7rem]">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-white/65">{PERSONA_FOCUS[persona]}</p>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-xs uppercase tracking-wider text-white/45">Today</div>
            <div className="mt-0.5 text-sm font-semibold text-white/90">
              {new Date().toLocaleDateString('en-NG', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <KpiSkeleton />
      ) : (
        <KpiRow persona={persona} m={m} pendingRx={pendingRx} />
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Revenue this week"
          subtitle="Paid orders, last 7 days"
          className="lg:col-span-2"
        >
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">
                  {formatKobo(m.revenueByDay.reduce((s, d) => s + d.value, 0))}
                </span>
                <span className="text-sm text-slate-400">collected this week</span>
              </div>
              <ColumnChart data={m.revenueByDay} format={(v) => formatKobo(v)} />
            </>
          )}
        </Panel>

        <Panel title="Order mix" subtitle="Prescription vs OTC">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Donut
              centerLabel={`${m.totalOrders}`}
              centerSub="total orders"
              segments={[
                { label: 'Prescription (℞)', value: m.rxOrders, color: '#0d9488' },
                { label: 'Over-the-counter', value: m.otcOrders, color: '#5eead4' },
              ]}
            />
          )}
        </Panel>
      </div>

      {/* Attention + status breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        <AttentionPanel persona={persona} m={m} pendingRx={pendingRx} loading={loading} />
        <Panel title="Orders by status" subtitle="Current pipeline" className="lg:col-span-2">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Bars
              items={m.statusCounts.slice(0, 7).map((s) => ({
                label: label(s.label),
                value: s.value,
                tone: statusBarTone(s.label),
              }))}
            />
          )}
        </Panel>
      </div>

      {/* Recent activity */}
      <RecentOrders orders={m.recent} loading={loading} />
    </div>
  );
}

function statusBarTone(status: string): string {
  const t = statusTone(status);
  return (
    {
      success: 'bg-emerald-500',
      warn: 'bg-amber-500',
      danger: 'bg-rose-500',
      info: 'bg-sky-500',
      neutral: 'bg-slate-400',
    }[t] ?? 'bg-brand-500'
  );
}

/* ───────────── Persona-specific KPI row ───────────── */

function KpiRow({
  persona,
  m,
  pendingRx,
}: {
  persona: Persona;
  m: ReturnType<typeof deriveMetrics>;
  pendingRx: number;
}) {
  if (persona === 'pharmacist') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Prescriptions to verify" value={pendingRx} icon={IconRx} tone="amber" hint="awaiting review" />
        <StatCard label="Orders awaiting ℞" value={m.awaitingRx} icon={IconClock} tone="amber" hint="blocked on verification" />
        <StatCard label="℞ orders total" value={m.rxOrders} icon={IconCheck} tone="brand" hint="all time" />
        <StatCard label="Orders today" value={m.todayOrders} icon={IconOrders} tone="sky" />
      </div>
    );
  }
  if (persona === 'manager') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ready to fulfil" value={m.toFulfil} icon={IconOrders} tone="brand" hint="paid, awaiting pick" />
        <StatCard label="In fulfilment" value={m.inFulfilment} icon={IconClock} tone="sky" hint="fulfilling / ready / out" />
        <StatCard label="Stock holds" value={m.stockHolds} icon={IconAlert} tone="rose" hint="paid but short stock" />
        <StatCard label="Prescriptions to verify" value={pendingRx} icon={IconRx} tone="amber" />
      </div>
    );
  }
  // owner / support
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Revenue (paid)"
        value={formatKobo(m.paidRevenueKobo)}
        icon={IconCash}
        tone="brand"
        hint="all time"
      />
      <StatCard
        label="Orders today"
        value={m.todayOrders}
        icon={IconOrders}
        tone="sky"
        hint={`${formatKobo(m.todayRevenueKobo)} today`}
      />
      <StatCard label="Avg. order value" value={formatKobo(m.aovKobo)} icon={IconCheck} tone="slate" hint={`${m.paidCount} paid orders`} />
      <StatCard label="Prescriptions to verify" value={pendingRx} icon={IconRx} tone="amber" hint="compliance queue" />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-4 h-8 w-20" />
          <Skeleton className="mt-3 h-3 w-16" />
        </Card>
      ))}
    </div>
  );
}

/* ───────────── Attention queue ───────────── */

function AttentionPanel({
  persona,
  m,
  pendingRx,
  loading,
}: {
  persona: Persona;
  m: ReturnType<typeof deriveMetrics>;
  pendingRx: number;
  loading: boolean;
}) {
  const items = [
    {
      show: persona !== 'manager',
      count: pendingRx,
      label: 'Prescriptions to verify',
      href: '/prescriptions',
      tone: 'warn' as const,
      icon: IconRx,
    },
    {
      show: true,
      count: m.toFulfil,
      label: 'Paid orders to fulfil',
      href: '/orders',
      tone: 'info' as const,
      icon: IconOrders,
    },
    {
      show: true,
      count: m.stockHolds,
      label: 'Stock holds to resolve',
      href: '/orders',
      tone: 'danger' as const,
      icon: IconAlert,
    },
    {
      show: persona !== 'pharmacist',
      count: m.awaitingPayment,
      label: 'Orders awaiting payment',
      href: '/orders',
      tone: 'neutral' as const,
      icon: IconClock,
    },
  ].filter((i) => i.show);

  return (
    <Panel title="Needs attention" subtitle="Action items in your scope">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <Link
              key={i.label}
              href={i.href}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-white">
                <i.icon width={18} height={18} />
              </span>
              <span className="flex-1 text-sm font-medium text-slate-700">{i.label}</span>
              <Badge tone={i.count > 0 ? i.tone : 'neutral'}>{i.count}</Badge>
              <IconChevronRight width={16} height={16} className="text-slate-300" />
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ───────────── Recent orders ───────────── */

function RecentOrders({ orders, loading }: { orders: OrderDto[]; loading: boolean }) {
  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <TableCard>
      <thead className="border-b border-slate-100 bg-slate-50/60">
        <tr>
          <Th>Order</Th>
          <Th>Status</Th>
          <Th>Type</Th>
          <Th>Placed</Th>
          <Th right>Total</Th>
          <Th right>{''}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {orders.length === 0 ? (
          <tr>
            <td colSpan={6}>
              <EmptyState title="No orders yet" description="Orders will appear here as customers check out." icon={IconOrders} />
            </td>
          </tr>
        ) : (
          orders.map((o) => (
            <tr key={o.id} className="transition-colors hover:bg-slate-50/60">
              <Td>
                <Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                  {o.orderNo}
                </Link>
              </Td>
              <Td>
                <Badge tone={statusTone(o.status)}>{label(o.status)}</Badge>
              </Td>
              <Td>{o.requiresRxVerification ? <span className="text-brand-700">℞ Rx</span> : 'OTC'}</Td>
              <Td className="text-slate-400">{timeAgo(o.createdAt)}</Td>
              <Td right className="font-semibold text-slate-900">
                {formatKobo(o.totals.totalKobo)}
              </Td>
              <Td right>
                <Link href={`/orders/${o.id}`}>
                  <IconChevronRight width={16} height={16} className="inline text-slate-300" />
                </Link>
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
  );
}
