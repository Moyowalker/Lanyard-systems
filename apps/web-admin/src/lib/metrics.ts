import type { OrderDto } from '@lanyard/contracts';

/** Statuses for which inventory is reserved / order is "open" operationally. */
const FULFILMENT_QUEUE = ['FULFILLING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

export interface DashboardMetrics {
  totalOrders: number;
  paidRevenueKobo: number;
  todayOrders: number;
  todayRevenueKobo: number;
  aovKobo: number;
  paidCount: number;
  awaitingPayment: number;
  awaitingRx: number;
  stockHolds: number;
  toFulfil: number; // PAID, not yet moving
  inFulfilment: number; // FULFILLING/READY/OUT
  completed: number;
  rxOrders: number;
  otcOrders: number;
  statusCounts: { label: string; value: number }[];
  revenueByDay: { label: string; value: number }[];
  recent: OrderDto[];
}

function isPaid(o: OrderDto): boolean {
  return o.payment?.status === 'paid';
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function deriveMetrics(orders: OrderDto[]): DashboardMetrics {
  const todayStart = startOfToday();
  const statusMap = new Map<string, number>();

  let paidRevenueKobo = 0;
  let todayRevenueKobo = 0;
  let todayOrders = 0;
  let paidCount = 0;
  let awaitingPayment = 0;
  let awaitingRx = 0;
  let stockHolds = 0;
  let toFulfil = 0;
  let inFulfilment = 0;
  let completed = 0;
  let rxOrders = 0;

  for (const o of orders) {
    statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);
    const created = new Date(o.createdAt).getTime();
    const isToday = !Number.isNaN(created) && created >= todayStart;
    if (isToday) todayOrders += 1;

    if (isPaid(o)) {
      paidCount += 1;
      paidRevenueKobo += o.totals.totalKobo;
      if (isToday) todayRevenueKobo += o.totals.totalKobo;
    }

    if (o.requiresRxVerification) rxOrders += 1;
    if (o.status === 'AWAITING_PAYMENT') awaitingPayment += 1;
    if (o.status === 'AWAITING_RX_VERIFICATION') awaitingRx += 1;
    if (o.status === 'STOCK_HOLD') stockHolds += 1;
    if (o.status === 'PAID') toFulfil += 1;
    if (FULFILMENT_QUEUE.includes(o.status)) inFulfilment += 1;
    if (o.status === 'COMPLETED') completed += 1;
  }

  // Last 7 days revenue, oldest→newest.
  const dayBuckets: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = d.getTime() + 24 * 60 * 60 * 1000;
    const value = orders
      .filter((o) => {
        if (!isPaid(o)) return false;
        const t = new Date(o.createdAt).getTime();
        return t >= d.getTime() && t < next;
      })
      .reduce((s, o) => s + o.totals.totalKobo, 0);
    dayBuckets.push({ label: d.toLocaleDateString('en-NG', { weekday: 'short' }), value });
  }

  const statusCounts = [...statusMap.entries()]
    .map(([k, v]) => ({ label: k, value: v }))
    .sort((a, b) => b.value - a.value);

  const recent = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return {
    totalOrders: orders.length,
    paidRevenueKobo,
    todayOrders,
    todayRevenueKobo,
    aovKobo: paidCount > 0 ? Math.round(paidRevenueKobo / paidCount) : 0,
    paidCount,
    awaitingPayment,
    awaitingRx,
    stockHolds,
    toFulfil,
    inFulfilment,
    completed,
    rxOrders,
    otcOrders: orders.length - rxOrders,
    statusCounts,
    revenueByDay: dayBuckets,
    recent,
  };
}
