'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BranchSummaryDto,
  Paginated,
  PosSaleDto,
  ProductListItemDto,
} from '@lanyard/contracts';

import { IconAlert, IconCash, IconCatalog, IconCheck, IconRx } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  Spinner,
  TableCard,
  Td,
  Th,
} from '@/components/ui';
import { formatKobo, formatDateTime } from '@/lib/format';

type CartLine = { product: ProductListItemDto; quantity: number };

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos_terminal', label: 'Card (terminal)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
] as const;

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function isControlled(p: ProductListItemDto): boolean {
  return p.regulatoryClass === 'CONTROLLED';
}
function isPom(p: ProductListItemDto): boolean {
  return p.regulatoryClass === 'POM';
}

/** Printable receipt: print CSS isolates #pos-receipt from the rest of the console. */
function Receipt({
  sale,
  branchName,
  onNewSale,
}: {
  sale: PosSaleDto;
  branchName?: string;
  onNewSale: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #pos-receipt, #pos-receipt * { visibility: visible !important; }
        #pos-receipt { position: absolute; left: 0; top: 0; width: 100%; }
      }`}</style>

      <div id="pos-receipt">
        <Card className="p-6">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">Lanyard Pharmacy</div>
            {branchName ? <div className="text-sm text-slate-500">{branchName}</div> : null}
            <div className="mt-1 text-xs text-slate-400">{formatDateTime(sale.createdAt)}</div>
            <div className="mt-2 inline-block rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-semibold text-slate-800">
              {sale.orderNo}
            </div>
          </div>

          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.items.map((item) => (
                <tr key={item.productId}>
                  <td className="py-2">
                    <div className="font-medium text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-400">
                      {[item.form, item.strength].filter(Boolean).join(' · ')}
                      {item.requiresPrescription ? ' · Rx' : ''}
                    </div>
                  </td>
                  <td className="py-2 text-right">{item.quantity}</td>
                  <td className="py-2 text-right font-medium">{formatKobo(item.lineTotalKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatKobo(sale.totals.totalKobo)}</span>
            </div>
            <div className="mt-1 flex justify-between text-slate-500">
              <span>Paid via</span>
              <span className="font-medium">
                {PAYMENT_OPTIONS.find((o) => o.value === sale.payment.channel)?.label ??
                  sale.payment.channel}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-slate-500">
              <span>Served by</span>
              <span>{sale.cashier.name ?? 'Staff'}</span>
            </div>
            {sale.customer ? (
              <div className="mt-1 flex justify-between text-slate-500">
                <span>Customer</span>
                <span>{sale.customer.name}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-5 text-center text-xs text-slate-400">
            Thank you — dispensed with care.
          </div>
        </Card>
      </div>

      <div className="mt-4 flex justify-center gap-3 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Print receipt
        </Button>
        <Button onClick={onNewSale}>New sale</Button>
      </div>
    </div>
  );
}

export default function PosPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [channel, setChannel] = useState<string>('cash');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerFirst, setCustomerFirst] = useState('');
  const [customerLast, setCustomerLast] = useState('');
  const [rxNote, setRxNote] = useState('');
  const [error, setError] = useState<string>();
  const [completedSale, setCompletedSale] = useState<PosSaleDto | null>(null);
  const idempotencyKey = useRef<string>('');

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'pos'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });
  const branches = branchesQ.data?.data ?? [];

  useEffect(() => {
    if (!branchId && branches[0]?.id) setBranchId(branches[0].id);
  }, [branchId, branches]);

  const productsQ = useQuery({
    queryKey: ['pos-products', branchId, search],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const params = new URLSearchParams({ branchId, limit: '30' });
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/catalog/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<ProductListItemDto>;
    },
  });
  const products = productsQ.data?.data ?? [];

  const salesQ = useQuery({
    queryKey: ['pos-sales', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/pos/sales?branchId=${branchId}`);
      if (!res.ok) throw new Error('Failed to load sales');
      return (await res.json()) as { data: PosSaleDto[] };
    },
  });
  const todaysSales = salesQ.data?.data ?? [];
  const todaysTotalKobo = todaysSales.reduce((sum, s) => sum + s.totals.totalKobo, 0);

  const lines = useMemo(() => [...cart.values()], [cart]);
  const subtotalKobo = lines.reduce(
    (sum, l) => sum + (l.product.price?.priceKobo ?? 0) * l.quantity,
    0,
  );
  const hasPomLine = lines.some((l) => isPom(l.product));

  function addToCart(product: ProductListItemDto) {
    if (isControlled(product) || product.price == null || product.inStock === false) return;
    setCart((current) => {
      const next = new Map(current);
      const existing = next.get(product.id);
      const available = product.available ?? 0;
      const quantity = Math.min((existing?.quantity ?? 0) + 1, Math.max(available, 1));
      next.set(product.id, { product, quantity });
      // Mint one idempotency key per physical sale (first item added).
      if (current.size === 0) idempotencyKey.current = crypto.randomUUID();
      return next;
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((current) => {
      const next = new Map(current);
      const line = next.get(productId);
      if (!line) return current;
      if (quantity <= 0) next.delete(productId);
      else
        next.set(productId, {
          ...line,
          quantity: Math.min(quantity, line.product.available ?? quantity),
        });
      return next;
    });
  }

  function resetSale() {
    setCart(new Map());
    setRxNote('');
    setCustomerPhone('');
    setCustomerFirst('');
    setCustomerLast('');
    setChannel('cash');
    setError(undefined);
    setCompletedSale(null);
    idempotencyKey.current = '';
  }

  const saleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/pos/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          payment: { channel },
          customer: customerPhone.trim()
            ? {
                phone: customerPhone.trim(),
                firstName: customerFirst.trim() || undefined,
                lastName: customerLast.trim() || undefined,
              }
            : undefined,
          rxNote: rxNote.trim() || undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Could not record the sale');
      return body as PosSaleDto;
    },
    onSuccess: async (sale) => {
      setCompletedSale(sale);
      setError(undefined);
      await queryClient.invalidateQueries({ queryKey: ['pos-sales', branchId] });
      await queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not record the sale'),
  });

  function confirmSale() {
    setError(undefined);
    if (lines.length === 0) return setError('Add at least one item to the sale.');
    if (hasPomLine && !rxNote.trim()) {
      return setError(
        'This sale includes prescription-only medicine — record the sighted prescription first.',
      );
    }
    if (customerPhone.trim() && !/^\+[1-9]\d{6,14}$/.test(customerPhone.trim())) {
      return setError('Customer phone must be in international format, e.g. +2348012345678.');
    }
    saleMutation.mutate();
  }

  const branchName = branches.find((b) => b.id === branchId)?.name;

  // Post-sale: show the receipt in place of the till.
  if (completedSale) {
    return (
      <div>
        <PageHeader title="Sale recorded" subtitle="Hand the customer their receipt" />
        <Receipt sale={completedSale} branchName={branchName} onNewSale={resetSale} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Point of Sale"
        subtitle="Ring up walk-in counter sales — stock and reports update instantly"
        actions={
          <select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setCart(new Map());
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ── Left: product picker ── */}
        <Panel
          title="Find medicines"
          subtitle="Search the catalog — prices and stock are for this branch"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, generic, or brand…"
            className={inputClass}
            autoFocus
          />

          {productsQ.isLoading ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No products found"
                description="Try a different search term, or check the product has a price at this branch."
                icon={IconCatalog}
              />
            </div>
          ) : (
            <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {products.map((p) => {
                const blocked = isControlled(p);
                const out = p.inStock === false || p.price == null;
                const disabled = blocked || out;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      disabled={disabled}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        disabled
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
                          : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{p.name}</span>
                        <span className="block text-xs text-slate-500">
                          {[p.form, p.strength, p.packSize].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        {blocked ? (
                          <Badge tone="danger">Controlled</Badge>
                        ) : isPom(p) ? (
                          <Badge tone="warn">Rx</Badge>
                        ) : null}
                        {out && !blocked ? <Badge tone="neutral">Out of stock</Badge> : null}
                        <span className="tnum font-semibold text-slate-900">
                          {p.price ? formatKobo(p.price.priceKobo) : '—'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* ── Right: the till ── */}
        <div className="space-y-4">
          <Panel title="Current sale" subtitle={branchName ? `At ${branchName}` : undefined}>
            {lines.length === 0 ? (
              <EmptyState
                title="No items yet"
                description="Search on the left and tap a medicine to add it."
                icon={IconCash}
              />
            ) : (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li
                    key={line.product.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {line.product.name}
                        {isPom(line.product) ? (
                          <span className="ml-1.5 align-middle">
                            <IconRx width={13} height={13} className="inline text-amber-600" />
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatKobo(line.product.price?.priceKobo ?? 0)} ×
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                        className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
                      <button
                        onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                        disabled={line.quantity >= (line.product.available ?? Infinity)}
                        className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <div className="tnum w-24 text-right text-sm font-semibold text-slate-900">
                      {formatKobo((line.product.price?.priceKobo ?? 0) * line.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {lines.length > 0 ? (
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-medium text-slate-500">Total</span>
                <span className="tnum text-xl font-bold text-slate-900">
                  {formatKobo(subtotalKobo)}
                </span>
              </div>
            ) : null}
          </Panel>

          {hasPomLine ? (
            <Panel
              title="Prescription sighted"
              subtitle="Required — this sale includes prescription-only medicine"
            >
              <textarea
                value={rxNote}
                onChange={(e) => setRxNote(e.target.value)}
                rows={2}
                placeholder="e.g. Paper Rx sighted — Dr Bello, LUTH, ref 4411"
                className={inputClass}
              />
            </Panel>
          ) : null}

          <Panel title="Customer (optional)" subtitle="Link the sale for purchase history">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone e.g. +23480…"
                inputMode="tel"
                className={`${inputClass} sm:col-span-2`}
              />
              <input
                value={customerFirst}
                onChange={(e) => setCustomerFirst(e.target.value)}
                placeholder="First name"
                className={inputClass}
              />
              <input
                value={customerLast}
                onChange={(e) => setCustomerLast(e.target.value)}
                placeholder="Last name"
                className={inputClass}
              />
            </div>
          </Panel>

          <Panel title="Payment">
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setChannel(option.value)}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition ${
                    channel === option.value
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {error ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <IconAlert width={16} height={16} className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}

            <Button
              className="mt-4 w-full justify-center py-3"
              onClick={confirmSale}
              disabled={saleMutation.isPending || lines.length === 0}
            >
              {saleMutation.isPending ? (
                <>
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Recording sale…
                </>
              ) : (
                <>Charge {formatKobo(subtotalKobo)}</>
              )}
            </Button>
          </Panel>
        </div>
      </div>

      {/* ── Today's sales ── */}
      <div className="mt-8">
        <Panel
          title="Today's counter sales"
          subtitle={`${todaysSales.length} sale${todaysSales.length === 1 ? '' : 's'} · ${formatKobo(todaysTotalKobo)}`}
          bodyClassName="p-0"
        >
          {salesQ.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : todaysSales.length === 0 ? (
            <EmptyState
              title="No sales yet today"
              description="Completed counter sales will appear here."
              icon={IconCheck}
            />
          ) : (
            <TableCard className="border-0 shadow-none">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Receipt</Th>
                  <Th>Time</Th>
                  <Th>Items</Th>
                  <Th>Payment</Th>
                  <Th>Customer</Th>
                  <Th right>Total</Th>
                  <Th right>{''}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todaysSales.map((sale) => (
                  <tr key={sale.orderId} className="hover:bg-slate-50/60">
                    <Td className="font-mono text-xs font-semibold text-slate-700">
                      {sale.orderNo}
                    </Td>
                    <Td className="text-slate-500">{formatDateTime(sale.createdAt)}</Td>
                    <Td>{sale.items.reduce((n, i) => n + i.quantity, 0)}</Td>
                    <Td>
                      {PAYMENT_OPTIONS.find((o) => o.value === sale.payment.channel)?.label ??
                        sale.payment.channel}
                    </Td>
                    <Td className="text-slate-500">{sale.customer?.name ?? 'Walk-in'}</Td>
                    <Td right className="font-semibold text-slate-900">
                      {formatKobo(sale.totals.totalKobo)}
                    </Td>
                    <Td right>
                      <Button variant="secondary" onClick={() => setCompletedSale(sale)}>
                        Receipt
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </Panel>
      </div>
    </div>
  );
}
