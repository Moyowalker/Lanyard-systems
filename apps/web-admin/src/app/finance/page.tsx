'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefundSchema, type OrderDto, type Paginated } from '@lanyard/contracts';

import { IconAlert, IconCash, IconCheck, IconClock, IconOrders } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  Spinner,
  StatCard,
  TableCard,
  Td,
  Th,
  cn,
} from '@/components/ui';
import { formatKobo, label, statusTone, timeAgo } from '@/lib/format';

type FinanceFilter = 'all' | 'paid' | 'awaiting-payment' | 'refunded';
type FormMessage = { tone: 'success' | 'danger'; text: string };

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function paymentTone(status?: string): 'success' | 'warn' | 'neutral' {
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'warn';
  return 'neutral';
}

function InlineNotice({ message }: { message?: FormMessage }) {
  if (!message) return null;
  return (
    <p
      className={
        message.tone === 'success'
          ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
          : 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'
      }
    >
      {message.text}
    </p>
  );
}

export default function FinancePage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FinanceFilter>('all');
  const [refundOrderId, setRefundOrderId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Staff-initiated refund');
  const [reconcileMessage, setReconcileMessage] = useState<FormMessage>();
  const [refundMessage, setRefundMessage] = useState<FormMessage>();

  const ordersQ = useQuery({
    queryKey: ['finance-orders'],
    queryFn: async () => {
      const res = await fetch('/api/admin/orders?limit=100');
      if (!res.ok) throw new Error('Failed to load orders');
      return (await res.json()) as Paginated<OrderDto>;
    },
    refetchInterval: 15000,
  });

  const orders = ordersQ.data?.data ?? [];
  const paidOrders = orders.filter((order) => order.payment.status === 'paid');
  const awaitingPaymentCount = orders.filter((order) => order.status === 'AWAITING_PAYMENT').length;
  const paidRevenue = paidOrders.reduce((sum, order) => sum + order.totals.totalKobo, 0);
  const refundedCount = orders.filter((order) => order.status === 'REFUNDED').length;

  useEffect(() => {
    if (!refundOrderId && paidOrders[0]?.id) setRefundOrderId(paidOrders[0].id);
  }, [paidOrders, refundOrderId]);

  const filteredOrders = useMemo(() => {
    switch (filter) {
      case 'paid':
        return orders.filter((order) => order.payment.status === 'paid');
      case 'awaiting-payment':
        return orders.filter((order) => order.status === 'AWAITING_PAYMENT');
      case 'refunded':
        return orders.filter((order) => order.status === 'REFUNDED');
      default:
        return orders;
    }
  }, [filter, orders]);

  const selectedRefundOrder = orders.find((order) => order.id === refundOrderId);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/payments/reconcile', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Reconciliation failed');
      return body as { checked?: number; settled?: number };
    },
    onSuccess: async (body) => {
      setReconcileMessage({
        tone: 'success',
        text: `Reconciliation checked ${body.checked ?? 0} pending intents and settled ${body.settled ?? 0}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['finance-orders'] });
    },
    onError: (error) => {
      setReconcileMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Reconciliation failed',
      });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Refund failed');
      return body;
    },
    onSuccess: async () => {
      setRefundMessage({ tone: 'success', text: 'Refund request submitted.' });
      setRefundAmount('');
      await queryClient.invalidateQueries({ queryKey: ['finance-orders'] });
    },
    onError: (error) => {
      setRefundMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Refund failed',
      });
    },
  });

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRefundMessage(undefined);
    const parsed = RefundSchema.safeParse({
      orderId: refundOrderId,
      amountKobo: refundAmount ? Number(refundAmount) : undefined,
      reason: refundReason,
    });
    if (!parsed.success) {
      setRefundMessage({
        tone: 'danger',
        text: parsed.error.issues[0]?.message ?? 'Check the refund form.',
      });
      return;
    }
    await refundMutation.mutateAsync(parsed.data);
  }

  const filters: Array<{ key: FinanceFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: orders.length },
    { key: 'paid', label: 'Paid', count: paidOrders.length },
    { key: 'awaiting-payment', label: 'Awaiting payment', count: awaitingPaymentCount },
    { key: 'refunded', label: 'Refunded', count: refundedCount },
  ];

  return (
    <div>
      <PageHeader
        title="Payments & refunds"
        subtitle="Monitor settlement status, reconcile pending intents, and issue staff refunds"
        actions={
          <Button onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending}>
            {reconcileMutation.isPending ? (
              <>
                <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Reconciling...
              </>
            ) : (
              'Run reconciliation'
            )}
          </Button>
        }
      />

      {ordersQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : ordersQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load payment operations"
            description="The finance view depends on the admin orders API."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Paid orders" value={paidOrders.length} icon={IconCheck} tone="brand" />
            <StatCard label="Paid revenue" value={formatKobo(paidRevenue)} icon={IconCash} tone="sky" />
            <StatCard label="Awaiting payment" value={awaitingPaymentCount} icon={IconClock} tone="amber" />
            <StatCard label="Refunded orders" value={refundedCount} icon={IconAlert} tone="rose" />
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
            <Panel title="Refund a paid order" subtitle="Leave amount blank for a full refund">
              <form className="space-y-4" onSubmit={submitRefund}>
                <div>
                  <label className={labelClass} htmlFor="refund-order">
                    Paid order
                  </label>
                  <select
                    id="refund-order"
                    value={refundOrderId}
                    onChange={(event) => setRefundOrderId(event.target.value)}
                    className={inputClass}
                  >
                    {paidOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="refund-amount">
                    Amount (kobo)
                  </label>
                  <input
                    id="refund-amount"
                    type="number"
                    min="1"
                    step="1"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    className={inputClass}
                    placeholder="Optional partial amount"
                  />
                  {selectedRefundOrder ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Order total: {formatKobo(selectedRefundOrder.totals.totalKobo, selectedRefundOrder.totals.currency)}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={labelClass} htmlFor="refund-reason">
                    Reason
                  </label>
                  <input
                    id="refund-reason"
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <InlineNotice message={refundMessage} />
                <InlineNotice message={reconcileMessage} />
                <Button type="submit" variant="danger" disabled={refundMutation.isPending || paidOrders.length === 0}>
                  {refundMutation.isPending ? (
                    <>
                      <Spinner className="h-4 w-4 border-rose-300/40 border-t-rose-700" /> Refunding...
                    </>
                  ) : (
                    'Create refund'
                  )}
                </Button>
              </form>
            </Panel>

            {orders.length === 0 ? (
              <Card>
                <EmptyState
                  title="No payment activity yet"
                  description="Orders with payment attempts will appear here once customers start checking out."
                  icon={IconOrders}
                />
              </Card>
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {filters.map((entry) => (
                    <button
                      key={entry.key}
                      onClick={() => setFilter(entry.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                        filter === entry.key
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {entry.label}
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-xs',
                          filter === entry.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {entry.count}
                      </span>
                    </button>
                  ))}
                </div>

                <TableCard>
                  <thead className="border-b border-slate-100 bg-slate-50/60">
                    <tr>
                      <Th>Order</Th>
                      <Th>Payment</Th>
                      <Th>Status</Th>
                      <Th>Placed</Th>
                      <Th right>Total</Th>
                      <Th right>{''}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="transition-colors hover:bg-slate-50/60">
                        <Td>
                          <div className="font-semibold text-slate-900">{order.orderNo}</div>
                          <div className="text-xs capitalize text-slate-500">{order.fulfillment.type}</div>
                        </Td>
                        <Td>
                          <Badge tone={paymentTone(order.payment.status)}>{order.payment.status}</Badge>
                        </Td>
                        <Td>
                          <Badge tone={statusTone(order.status)}>{label(order.status)}</Badge>
                        </Td>
                        <Td className="text-slate-500">{timeAgo(order.createdAt)}</Td>
                        <Td right className="font-semibold text-slate-900">
                          {formatKobo(order.totals.totalKobo, order.totals.currency)}
                        </Td>
                        <Td right>
                          <div className="flex justify-end gap-2">
                            {order.payment.status === 'paid' ? (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setRefundOrderId(order.id);
                                  setRefundReason('Staff-initiated refund');
                                }}
                              >
                                Refund
                              </Button>
                            ) : null}
                            <Link href={`/orders/${order.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                              Open order
                            </Link>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}