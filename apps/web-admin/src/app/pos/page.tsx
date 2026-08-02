'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BranchSummaryDto,
  MeResponse,
  Paginated,
  PosReturnResultDto,
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

type DiscountType = 'percent' | 'fixed';

type PaymentRow = { channel: string; amountNaira: string };

/** A parked (held) sale — kept in localStorage per branch so the till can multitask. */
type HeldSale = {
  id: string;
  label: string;
  heldAt: string;
  lines: Array<{ productId: string; name: string; quantity: number }>;
  customerPhone: string;
  customerFirst: string;
  customerLast: string;
  rxNote: string;
  discountType: DiscountType;
  discountValue: string;
};

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos_terminal', label: 'Card (terminal)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'hmo', label: 'HMO' },
] as const;

function channelLabel(channel: string): string {
  return PAYMENT_OPTIONS.find((o) => o.value === channel)?.label ?? channel;
}

/** Channels the customer settles themselves, as opposed to HMO cover. */
const OUT_OF_POCKET: ReadonlySet<string> = new Set(['cash', 'pos_terminal', 'bank_transfer']);

type PaymentLike = { channel: string; amountKobo?: number };

/**
 * An HMO line alongside anything the customer pays themselves IS a copay — that is the term
 * the pharmacy uses. There is no separate `copay` channel; it is the shape of the split.
 */
function isCopay(payments: PaymentLike[]): boolean {
  return (
    payments.some((p) => p.channel === 'hmo') && payments.some((p) => OUT_OF_POCKET.has(p.channel))
  );
}

/** Short description of how a sale was, or is about to be, paid. */
function paymentSummary(payments: PaymentLike[]): string {
  if (payments.length === 0) return '—';
  if (payments.length === 1) return channelLabel(payments[0].channel);
  const joined = payments.map((p) => channelLabel(p.channel)).join(' + ');
  return `${isCopay(payments) ? 'Copay' : 'Split'} · ${joined}`;
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function isControlled(p: ProductListItemDto): boolean {
  return p.regulatoryClass === 'CONTROLLED';
}
function isPom(p: ProductListItemDto): boolean {
  return p.regulatoryClass === 'POM';
}

function heldSalesKey(branchId: string): string {
  return `pos:held:${branchId}`;
}

function loadHeldSales(branchId: string): HeldSale[] {
  if (typeof window === 'undefined' || !branchId) return [];
  try {
    return JSON.parse(window.localStorage.getItem(heldSalesKey(branchId)) ?? '[]') as HeldSale[];
  } catch {
    return [];
  }
}

function storeHeldSales(branchId: string, sales: HeldSale[]) {
  window.localStorage.setItem(heldSalesKey(branchId), JSON.stringify(sales));
}

/** Printable receipt: print CSS isolates #pos-receipt from the rest of the console. */
function Receipt({
  sale,
  branchName,
  onNewSale,
  onBack,
}: {
  sale: PosSaleDto;
  branchName?: string;
  onNewSale?: () => void;
  onBack?: () => void;
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
            {sale.totals.discountKobo > 0 ? (
              <>
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatKobo(sale.totals.subtotalKobo)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span>−{formatKobo(sale.totals.discountKobo)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatKobo(sale.totals.totalKobo)}</span>
            </div>
            {/* Payment method is the thing cashiers most often need to re-check, so it gets a
                high-contrast block of its own rather than blending into the meta rows below. */}
            <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {isCopay(sale.payments)
                    ? 'Paid via · Copay'
                    : sale.payments.length > 1
                      ? 'Paid via · Split'
                      : 'Paid via'}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {sale.payments.map((payment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm font-semibold text-brand-900"
                  >
                    <span>{channelLabel(payment.channel)}</span>
                    {/* Always show the amount — previously single payments showed none. */}
                    <span>{formatKobo(payment.amountKobo)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-slate-500">
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
        {onBack ? (
          <Button variant="secondary" onClick={onBack}>
            Back to till
          </Button>
        ) : null}
        {onNewSale ? <Button onClick={onNewSale}>New sale</Button> : null}
      </div>
    </div>
  );
}

/** Per-line quantity picker + reason for returning part or all of a past sale. */
function ReturnDialog({
  sale,
  onClose,
  onReturned,
}: {
  sale: PosSaleDto;
  onClose: () => void;
  onReturned: () => void;
}) {
  const returned = sale.returnedByProduct ?? {};
  const returnable = sale.items
    .map((item) => ({ ...item, remaining: item.quantity - (returned[item.productId] ?? 0) }))
    .filter((item) => item.remaining > 0);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(returnable.map((item) => [item.productId, item.remaining])),
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  const discountFactor =
    sale.totals.subtotalKobo > 0 ? 1 - sale.totals.discountKobo / sale.totals.subtotalKobo : 1;
  const selected = returnable.filter((item) => (quantities[item.productId] ?? 0) > 0);
  const refundPreviewKobo = Math.round(
    selected.reduce(
      (sum, item) => sum + item.unitPriceKobo * (quantities[item.productId] ?? 0),
      0,
    ) * discountFactor,
  );

  const returnMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/pos/sales/${sale.orderId}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((item) => ({
            productId: item.productId,
            quantity: quantities[item.productId],
          })),
          reason: reason.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Return failed');
      return body as PosReturnResultDto;
    },
    onSuccess: onReturned,
    onError: (err) => setError(err instanceof Error ? err.message : 'Return failed'),
  });

  function submit() {
    setError(undefined);
    if (selected.length === 0) return setError('Pick at least one item to return.');
    if (reason.trim().length < 3)
      return setError('A short reason is required for the audit trail.');
    returnMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Return sale {sale.orderNo}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Goods go back to stock and the refund is settled at the till.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {returnable.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Everything on this sale is already returned.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {returnable.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{item.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatKobo(item.unitPriceKobo)} · {item.remaining} returnable
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setQuantities((current) => ({
                        ...current,
                        [item.productId]: Math.max(0, (current[item.productId] ?? 0) - 1),
                      }))
                    }
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {quantities[item.productId] ?? 0}
                  </span>
                  <button
                    onClick={() =>
                      setQuantities((current) => ({
                        ...current,
                        [item.productId]: Math.min(
                          item.remaining,
                          (current[item.productId] ?? 0) + 1,
                        ),
                      }))
                    }
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required) — e.g. wrong strength dispensed"
            className={inputClass}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm font-medium text-slate-500">Refund due</span>
          <span className="tnum text-lg font-bold text-slate-900">
            {formatKobo(refundPreviewKobo)}
          </span>
        </div>
        {sale.totals.discountKobo > 0 ? (
          <p className="mt-1 text-xs text-slate-400">
            Refund is proportional to the {formatKobo(sale.totals.discountKobo)} discount on this
            sale.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            disabled={returnMutation.isPending || returnable.length === 0}
          >
            {returnMutation.isPending ? (
              <>
                <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Returning…
              </>
            ) : (
              `Refund ${formatKobo(refundPreviewKobo)}`
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function PosPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [searchNotice, setSearchNotice] = useState<{ tone: 'warn' | 'info'; text: string }>();
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [payments, setPayments] = useState<PaymentRow[]>([{ channel: 'cash', amountNaira: '' }]);
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerFirst, setCustomerFirst] = useState('');
  const [customerLast, setCustomerLast] = useState('');
  const [rxNote, setRxNote] = useState('');
  const [error, setError] = useState<string>();
  const [completedSale, setCompletedSale] = useState<PosSaleDto | null>(null);
  // A receipt opened from the history table — dismiss it without touching the live cart.
  const [viewingPastSale, setViewingPastSale] = useState(false);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [returningSale, setReturningSale] = useState<PosSaleDto | null>(null);
  const idempotencyKey = useRef<string>('');
  const scanRef = useRef<HTMLInputElement>(null);

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const r = await fetch('/api/me');
      return r.ok ? ((await r.json()) as MeResponse) : null;
    },
  });
  const canRefund = meQ.data?.permissions?.includes('pos:refund') ?? false;

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

  useEffect(() => {
    if (branchId) setHeldSales(loadHeldSales(branchId));
  }, [branchId]);

  // Global keyboard-wedge scanner capture: assemble rapid keystrokes ending in Enter
  // when no text field is focused, and route them through the same exact-match handler.
  // This makes scanning work even when the cursor is anywhere on the POS page.
  useEffect(() => {
    if (!branchId) return;
    let buffer = '';
    let last = 0;
    function isEditable(node: EventTarget | null): boolean {
      const el = node as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      );
    }
    function onKeyDown(event: KeyboardEvent) {
      if (isEditable(document.activeElement)) return; // typed into a field — leave it alone
      const now = Date.now();
      if (now - last > 100) buffer = ''; // gap too large → not a scan burst
      last = now;
      if (event.key === 'Enter') {
        if (buffer.length >= 3) void addByCode(buffer);
        buffer = '';
        return;
      }
      if (event.key.length === 1) buffer += event.key;
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // addByCode closes over branchId; rebinding on branchId keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  // Debounce the search so we don't refetch on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const productsQ = useQuery({
    queryKey: ['pos-products', branchId, debouncedSearch],
    enabled: Boolean(branchId),
    placeholderData: keepPreviousData, // keep results visible while the next search loads
    queryFn: async () => {
      const params = new URLSearchParams({ branchId, limit: '30' });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      // Staff lookup: includes products hidden from the storefront but sellable at the till.
      const res = await fetch(`/api/admin/pos/products?${params.toString()}`);
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
  // Mirrors the server: percent of subtotal or fixed naira (→ kobo), capped at subtotal.
  const discountKobo = useMemo(() => {
    const value = Number(discountValue);
    if (!discountValue.trim() || !Number.isFinite(value) || value <= 0) return 0;
    const raw =
      discountType === 'percent'
        ? Math.round((subtotalKobo * Math.min(value, 100)) / 100)
        : Math.round(value * 100);
    return Math.min(subtotalKobo, raw);
  }, [discountType, discountValue, subtotalKobo]);
  const totalKobo = subtotalKobo - discountKobo;

  const paymentsSumKobo = payments.reduce(
    (sum, row) => sum + Math.round(Number(row.amountNaira || 0) * 100),
    0,
  );
  const remainderKobo = totalKobo - paymentsSumKobo;
  const hasPomLine = lines.some((l) => isPom(l.product));

  // Single payment rows track the total automatically; splits are entered manually.
  useEffect(() => {
    if (payments.length === 1) {
      const amountNaira = totalKobo > 0 ? String(totalKobo / 100) : '';
      if (payments[0].amountNaira !== amountNaira) {
        setPayments([{ ...payments[0], amountNaira }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalKobo]);

  function addToCart(product: ProductListItemDto) {
    if (isControlled(product) || product.price == null || product.inStock === false) return;
    // Mint one idempotency key per physical sale (kept out of the state updater so it
    // stays pure under Strict Mode double-invocation).
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setCart((current) => {
      const next = new Map(current);
      const existing = next.get(product.id);
      const available = product.available ?? 0;
      const quantity = Math.min((existing?.quantity ?? 0) + 1, Math.max(available, 1));
      next.set(product.id, { product, quantity });
      return next;
    });
  }

  /**
   * Resolve an exact barcode/SKU match and add it to the cart. Shared by the single
   * search bar (Enter) and the page-level keyboard-wedge scanner capture. Returns true
   * on a successful add; sets a distinguishing notice otherwise (no match vs matched
   * but not sellable here).
   */
  async function addByCode(code: string): Promise<boolean> {
    const trimmed = code.trim();
    if (!trimmed || !branchId) return false;
    try {
      const res = await fetch(
        `/api/admin/pos/products?branchId=${branchId}&barcode=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) throw new Error('Lookup failed');
      const body = (await res.json()) as Paginated<ProductListItemDto>;
      const product = body.data[0];
      if (!product) {
        setSearchNotice({
          tone: 'info',
          text: `No exact barcode/SKU match for “${trimmed}” — showing search results instead.`,
        });
        return false;
      }
      if (isControlled(product)) {
        setSearchNotice({
          tone: 'warn',
          text: `${product.name} is a controlled substance — cannot be sold at the counter.`,
        });
        return false;
      }
      if (product.price == null || product.inStock === false) {
        setSearchNotice({
          tone: 'warn',
          text: `${product.name} matched but has no price or stock at this branch.`,
        });
        return false;
      }
      addToCart(product);
      setSearchNotice(undefined);
      return true;
    } catch {
      setSearchNotice({ tone: 'warn', text: 'Barcode lookup failed — try again.' });
      return false;
    }
  }

  /** Enter in the search bar: try an exact barcode/SKU match first, else keep searching. */
  async function handleSearchEnter() {
    const code = search.trim();
    if (!code) return;
    if (await addByCode(code)) {
      setSearch('');
      scanRef.current?.focus();
    }
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
    setPayments([{ channel: 'cash', amountNaira: '' }]);
    setDiscountType('percent');
    setDiscountValue('');
    setError(undefined);
    setSearchNotice(undefined);
    setCompletedSale(null);
    idempotencyKey.current = '';
  }

  /* ── hold / resume / cancel (local, per till) ── */

  function holdSale() {
    if (lines.length === 0) return;
    const label =
      [customerFirst, customerLast].filter(Boolean).join(' ') ||
      customerPhone.trim() ||
      `${lines.length} item${lines.length === 1 ? '' : 's'} · ${formatKobo(subtotalKobo)}`;
    const held: HeldSale = {
      id: crypto.randomUUID(),
      label,
      heldAt: new Date().toISOString(),
      lines: lines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        quantity: l.quantity,
      })),
      customerPhone,
      customerFirst,
      customerLast,
      rxNote,
      discountType,
      discountValue,
    };
    const next = [held, ...heldSales];
    setHeldSales(next);
    storeHeldSales(branchId, next);
    resetSale();
  }

  async function resumeSale(held: HeldSale) {
    // Re-resolve every line so CURRENT prices and stock apply (held prices may be stale).
    setError(undefined);
    const restored = new Map<string, CartLine>();
    const missing: string[] = [];
    for (const line of held.lines) {
      const res = await fetch(
        `/api/admin/pos/products?branchId=${branchId}&q=${encodeURIComponent(line.name)}&limit=30`,
      );
      const body = res.ok ? ((await res.json()) as Paginated<ProductListItemDto>) : null;
      const product = body?.data.find((p) => p.id === line.productId);
      if (!product || product.price == null || isControlled(product)) {
        missing.push(line.name);
        continue;
      }
      restored.set(product.id, {
        product,
        quantity: Math.min(line.quantity, Math.max(product.available ?? 0, 1)),
      });
    }
    setCart(restored);
    setCustomerPhone(held.customerPhone);
    setCustomerFirst(held.customerFirst);
    setCustomerLast(held.customerLast);
    setRxNote(held.rxNote);
    setDiscountType(held.discountType);
    setDiscountValue(held.discountValue);
    setPayments([{ channel: 'cash', amountNaira: '' }]);
    idempotencyKey.current = crypto.randomUUID();
    cancelHeld(held.id);
    setShowHeld(false);
    if (missing.length > 0) {
      setError(`Some held items are no longer sellable and were dropped: ${missing.join(', ')}.`);
    }
  }

  function cancelHeld(id: string) {
    const next = heldSales.filter((h) => h.id !== id);
    setHeldSales(next);
    storeHeldSales(branchId, next);
  }

  const saleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/pos/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          payments: payments
            .filter((row) => Number(row.amountNaira) > 0)
            .map((row) => ({
              channel: row.channel,
              amountKobo: Math.round(Number(row.amountNaira) * 100),
            })),
          discount:
            discountKobo > 0
              ? {
                  type: discountType,
                  value:
                    discountType === 'percent'
                      ? Math.min(Number(discountValue), 100)
                      : Math.round(Number(discountValue) * 100),
                }
              : undefined,
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
      setViewingPastSale(false);
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
    if (remainderKobo !== 0) {
      return setError(
        remainderKobo > 0
          ? `Payments are ${formatKobo(remainderKobo)} short of the total.`
          : `Payments exceed the total by ${formatKobo(-remainderKobo)}.`,
      );
    }
    saleMutation.mutate();
  }

  const branchName = branches.find((b) => b.id === branchId)?.name;

  // Show a receipt: after a fresh sale (start a new sale next), or when reopened from
  // history (dismiss back to the in-progress till without clearing it).
  if (completedSale) {
    return (
      <div>
        <PageHeader
          title={viewingPastSale ? 'Receipt' : 'Sale recorded'}
          subtitle={`${viewingPastSale ? 'A past counter sale' : 'Hand the customer their receipt'} · Paid by ${paymentSummary(
            completedSale.payments,
          )}`}
        />
        <Receipt
          sale={completedSale}
          branchName={branchName}
          onNewSale={viewingPastSale ? undefined : resetSale}
          onBack={
            viewingPastSale
              ? () => {
                  setCompletedSale(null);
                  setViewingPastSale(false);
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Point of Sale"
        subtitle="Ring up walk-in counter sales — stock and reports update instantly"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowHeld((open) => !open)}>
              Held sales{heldSales.length > 0 ? ` (${heldSales.length})` : ''}
            </Button>
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
          </div>
        }
      />

      {showHeld ? (
        <Panel
          title="Held sales"
          subtitle="Parked carts on this till — resume to continue, cancel to discard"
          className="mb-5"
        >
          {heldSales.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing on hold. Use “Hold sale” on the till to park the current cart.
            </p>
          ) : (
            <ul className="space-y-2">
              {heldSales.map((held) => (
                <li
                  key={held.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{held.label}</div>
                    <div className="text-xs text-slate-500">
                      {held.lines.reduce((n, l) => n + l.quantity, 0)} items · held{' '}
                      {formatDateTime(held.heldAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => resumeSale(held)}>
                      Resume
                    </Button>
                    <Button variant="ghost" onClick={() => cancelHeld(held.id)}>
                      Cancel
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ── Left: product picker ── */}
        <Panel
          title="Find medicines"
          subtitle="Scan a barcode or search — prices and stock are for this branch"
        >
          <input
            ref={scanRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSearchEnter();
              }
            }}
            placeholder="Scan barcode, or search by name, generic, brand, or code…"
            className={inputClass}
            autoFocus
            aria-label="Scan or search products"
          />
          {searchNotice ? (
            <p
              className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                searchNotice.tone === 'warn'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-slate-50 text-slate-600'
              }`}
            >
              {searchNotice.text}
            </p>
          ) : null}

          {productsQ.isError ? (
            <div className="mt-4">
              <EmptyState
                title="Couldn’t load products"
                description="The product lookup failed for this branch. Check your connection or permissions, then retry."
                icon={IconAlert}
              />
              <div className="mt-3">
                <Button variant="secondary" onClick={() => productsQ.refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : productsQ.isLoading ? (
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
          <Panel
            title="Current sale"
            subtitle={branchName ? `At ${branchName}` : undefined}
            action={
              <Button
                variant="secondary"
                onClick={holdSale}
                disabled={lines.length === 0}
                title={
                  lines.length === 0 ? 'Add items to the cart before holding the sale' : undefined
                }
              >
                Hold sale
              </Button>
            }
          >
            {lines.length === 0 ? (
              <EmptyState
                title="No items yet"
                description="Scan a barcode or search on the left to add medicines."
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

            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              {lines.length > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-500">Subtotal</span>
                  <span className="tnum font-semibold text-slate-800">
                    {formatKobo(subtotalKobo)}
                  </span>
                </div>
              ) : null}
              {/* Discount is always discoverable — disabled until the cart has items. */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-500">Discount</span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                    {(['percent', 'fixed'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        disabled={lines.length === 0}
                        onClick={() => setDiscountType(type)}
                        className={`px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                          discountType === type
                            ? 'bg-brand-500 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {type === 'percent' ? '%' : '₦'}
                      </button>
                    ))}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={discountType === 'percent' ? '1' : '50'}
                    max={discountType === 'percent' ? 100 : undefined}
                    value={discountValue}
                    disabled={lines.length === 0}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-brand-500 disabled:bg-slate-50"
                    aria-label={`Discount ${discountType === 'percent' ? 'percentage' : 'amount in naira'}`}
                  />
                </span>
              </div>
              {discountKobo > 0 ? (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Discount applied</span>
                  <span className="tnum">−{formatKobo(discountKobo)}</span>
                </div>
              ) : null}
              {lines.length > 0 ? (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-medium text-slate-500">Total</span>
                  <span className="tnum text-xl font-bold text-slate-900">
                    {formatKobo(totalKobo)}
                  </span>
                </div>
              ) : null}
              {/* Keeps the chosen method on screen while ringing up, not just inside the
                  Payment panel further down the page. */}
              {lines.length > 0 ? (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="text-sm font-medium text-slate-500">Paying by</span>
                  <span className="text-sm font-semibold text-brand-700">
                    {paymentSummary(payments)}
                  </span>
                </div>
              ) : null}
            </div>
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

          <Panel
            title="Payment"
            subtitle="Up to 3 methods — amounts must add up to the total"
            action={
              payments.length < 3 ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPayments((current) => [...current, { channel: 'cash', amountNaira: '' }])
                  }
                >
                  Split payment
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-2">
              {payments.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={row.channel}
                    onChange={(e) =>
                      setPayments((current) =>
                        current.map((r, i) =>
                          i === index ? { ...r, channel: e.target.value } : r,
                        ),
                      )
                    }
                    className={`${inputClass} flex-1`}
                    aria-label={`Payment method ${index + 1}`}
                  >
                    {PAYMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={row.amountNaira}
                    onChange={(e) =>
                      setPayments((current) =>
                        current.map((r, i) =>
                          i === index ? { ...r, amountNaira: e.target.value } : r,
                        ),
                      )
                    }
                    disabled={payments.length === 1}
                    placeholder="Amount ₦"
                    className={`${inputClass} w-32 text-right disabled:bg-slate-50`}
                    aria-label={`Payment amount ${index + 1} in naira`}
                  />
                  {payments.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPayments((current) => current.filter((_, i) => i !== index))
                      }
                      className="rounded-lg px-2 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      aria-label={`Remove payment ${index + 1}`}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {payments.length > 1 && lines.length > 0 ? (
              <p
                className={`mt-2 text-sm ${
                  remainderKobo === 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {remainderKobo === 0
                  ? 'Payments match the total.'
                  : remainderKobo > 0
                    ? `${formatKobo(remainderKobo)} left to allocate.`
                    : `${formatKobo(-remainderKobo)} over the total.`}
              </p>
            ) : null}

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
                <>
                  Charge {formatKobo(totalKobo)} · {paymentSummary(payments)}
                </>
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
                {todaysSales.map((sale) => {
                  const isReturned = sale.orderStatus === 'REFUNDED';
                  return (
                    <tr key={sale.orderId} className="hover:bg-slate-50/60">
                      <Td className="font-mono text-xs font-semibold text-slate-700">
                        {sale.orderNo}
                        {isReturned ? (
                          <span className="ml-1.5">
                            <Badge tone="danger">Returned</Badge>
                          </span>
                        ) : sale.returnedByProduct ? (
                          <span className="ml-1.5">
                            <Badge tone="warn">Partial return</Badge>
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-slate-500">{formatDateTime(sale.createdAt)}</Td>
                      <Td>{sale.items.reduce((n, i) => n + i.quantity, 0)}</Td>
                      <Td>{sale.payments.map((p) => channelLabel(p.channel)).join(' + ')}</Td>
                      <Td className="text-slate-500">{sale.customer?.name ?? 'Walk-in'}</Td>
                      <Td right className="font-semibold text-slate-900">
                        {formatKobo(sale.totals.totalKobo)}
                      </Td>
                      <Td right>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setViewingPastSale(true);
                              setCompletedSale(sale);
                            }}
                          >
                            Receipt
                          </Button>
                          {canRefund && !isReturned ? (
                            <Button variant="ghost" onClick={() => setReturningSale(sale)}>
                              Return
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}
        </Panel>
      </div>

      {returningSale ? (
        <ReturnDialog
          sale={returningSale}
          onClose={() => setReturningSale(null)}
          onReturned={async () => {
            setReturningSale(null);
            await queryClient.invalidateQueries({ queryKey: ['pos-sales', branchId] });
            await queryClient.invalidateQueries({ queryKey: ['pos-products'] });
          }}
        />
      ) : null}
    </div>
  );
}
