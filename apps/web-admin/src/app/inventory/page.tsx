'use client';

import { Fragment, FormEvent, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdjustInventorySchema,
  BranchInventoryItemDto,
  BranchSummaryDto,
  Paginated,
  ReceiveInvoiceSchema,
  StockInvoiceDto,
  StockMovementDto,
  StockMovementType,
} from '@lanyard/contracts';

import { IconAlert, IconBranch, IconCheck, IconClock, IconInventory } from '@/components/icons';
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
import { formatDateTime, formatKobo } from '@/lib/format';
import { useBranchPrices } from '@/components/use-branch-prices';

type AdminProductLookup = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
};

/** One line of the goods-received (invoice) form. Money fields are naira strings. */
type InvoiceLineForm = {
  productId: string;
  quantity: string;
  batchNo: string;
  expiry: string;
  reorderLevel: string;
  costNaira: string;
  priceNaira: string;
  /** '' = leave storefront visibility unchanged. */
  visibility: '' | 'visible' | 'hidden';
};

type InvoiceFormState = {
  vendorName: string;
  invoiceNo: string;
  invoiceDate: string;
  note: string;
  lines: InvoiceLineForm[];
};

const EMPTY_INVOICE_LINE: InvoiceLineForm = {
  productId: '',
  quantity: '',
  batchNo: '',
  expiry: '',
  reorderLevel: '',
  costNaira: '',
  priceNaira: '',
  visibility: '',
};

const EMPTY_INVOICE_FORM: InvoiceFormState = {
  vendorName: '',
  invoiceNo: '',
  invoiceDate: '',
  note: '',
  lines: [EMPTY_INVOICE_LINE],
};

type AdjustFormState = {
  productId: string;
  quantityDelta: string;
  reorderLevel: string;
  batchNo: string;
  expiry: string;
  reason: string;
};

type FormMessage = {
  tone: 'success' | 'danger';
  text: string;
};

type StatusFilter = 'all' | 'low' | 'out';

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500';

const EXPIRING_SOON_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const INVENTORY_COLSPAN = 10;

function stockTone(row: BranchInventoryItemDto): 'success' | 'warn' | 'danger' {
  if (row.available <= 0) return 'danger';
  if (row.available <= Math.max(1, row.reorderLevel)) return 'warn';
  return 'success';
}

function stockLabel(row: BranchInventoryItemDto): string {
  if (row.available <= 0) return 'Out of stock';
  if (row.available <= Math.max(1, row.reorderLevel)) return 'Low stock';
  return 'Healthy';
}

/** Colour + a short hint for a batch expiry date relative to today. */
function expiryInfo(nextExpiry?: string): { className: string; label: string; hint?: string } {
  if (!nextExpiry) return { className: 'text-slate-400', label: '—' };
  const days = Math.ceil((new Date(nextExpiry).getTime() - Date.now()) / DAY_MS);
  const label = formatDateTime(nextExpiry);
  if (days <= 0) return { className: 'font-semibold text-rose-600', label, hint: 'Expired' };
  if (days <= EXPIRING_SOON_DAYS)
    return { className: 'font-semibold text-amber-700', label, hint: `${days}d left` };
  return { className: 'text-slate-500', label };
}

const MOVEMENT_TONE: Record<StockMovementType, 'success' | 'warn' | 'danger' | 'info' | 'neutral'> =
  {
    [StockMovementType.RECEIVE]: 'success',
    [StockMovementType.ADJUST]: 'info',
    [StockMovementType.RESERVE]: 'warn',
    [StockMovementType.RELEASE]: 'neutral',
    [StockMovementType.DISPENSE]: 'danger',
    [StockMovementType.RETURN]: 'success',
  };

function short(id?: string): string {
  return id ? id.slice(-6) : '—';
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('transition-transform', open && 'rotate-180')}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** Compact movement rows used both per-product (in an expanded row) and standalone. */
function MovementList({ movements }: { movements: StockMovementDto[] }) {
  if (movements.length === 0) {
    return <p className="text-sm text-slate-500">No stock movements recorded yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {movements.map((m) => (
        <li
          key={m.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <Badge tone={MOVEMENT_TONE[m.type]}>{m.type}</Badge>
            <span
              className={cn('font-semibold', m.quantity < 0 ? 'text-rose-600' : 'text-emerald-600')}
            >
              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
            </span>
            {m.reason ? <span className="text-slate-500">{m.reason}</span> : null}
          </div>
          <span className="shrink-0 text-xs text-slate-400">{formatDateTime(m.at)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<StockMovementType | 'all'>('all');
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(EMPTY_INVOICE_FORM);
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    productId: '',
    quantityDelta: '',
    reorderLevel: '',
    batchNo: '',
    expiry: '',
    reason: '',
  });
  const [invoiceMessage, setInvoiceMessage] = useState<FormMessage>();
  const [adjustMessage, setAdjustMessage] = useState<FormMessage>();

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'inventory'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });

  const productsQ = useQuery({
    queryKey: ['admin-products', 'inventory'],
    queryFn: async () => {
      const res = await fetch('/api/admin/catalog/products?limit=100');
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<AdminProductLookup>;
    },
  });

  const branches = branchesQ.data?.data ?? [];
  const products = useMemo(() => productsQ.data?.data ?? [], [productsQ.data]);

  useEffect(() => {
    if (!branchId && branches[0]?.id) {
      setBranchId(branches[0].id);
    }
  }, [branchId, branches]);

  const inventoryQ = useQuery({
    queryKey: ['admin-inventory', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory`);
      if (!res.ok) throw new Error('Failed to load inventory');
      return (await res.json()) as { data: BranchInventoryItemDto[] };
    },
  });

  const lowStockQ = useQuery({
    queryKey: ['admin-low-stock', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory/low-stock`);
      if (!res.ok) throw new Error('Failed to load low-stock inventory');
      return (await res.json()) as { data: BranchInventoryItemDto[] };
    },
  });

  const expiringQ = useQuery({
    queryKey: ['admin-expiring', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/expiring?days=${EXPIRING_SOON_DAYS}`,
      );
      if (!res.ok) throw new Error('Failed to load expiring inventory');
      return (await res.json()) as { data: BranchInventoryItemDto[] };
    },
  });

  const activityQ = useInfiniteQuery({
    queryKey: ['admin-inventory-movements', branchId, activityType],
    enabled: Boolean(branchId),
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '25' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (activityType !== 'all') params.set('type', activityType);
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/movements?${params.toString()}`,
      );
      if (!res.ok) throw new Error('Failed to load stock movements');
      return (await res.json()) as Paginated<StockMovementDto>;
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });

  const prices = useBranchPrices(branchId, products);

  // Per-product movement history for the expanded row.
  const productMovementsQ = useQuery({
    queryKey: ['admin-inventory-movements', branchId, 'product', expandedProductId],
    enabled: Boolean(branchId && expandedProductId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/movements?limit=8&productId=${expandedProductId}`,
      );
      if (!res.ok) throw new Error('Failed to load product movements');
      return (await res.json()) as Paginated<StockMovementDto>;
    },
  });

  function downloadExport(format: 'xlsx' | 'csv') {
    if (!branchId) return;
    window.open(`/api/admin/branches/${branchId}/inventory/export?format=${format}`, '_blank');
  }

  const rows = inventoryQ.data?.data ?? [];
  const inventoryByProductId = new Map(rows.map((row) => [row.productId, row]));
  const lowStockRows = lowStockQ.data?.data ?? rows.filter((row) => row.isLowStock);
  const expiringCount = expiringQ.data?.data.length ?? 0;
  const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);
  const totalReserved = rows.reduce((sum, row) => sum + row.reserved, 0);
  const lowStockCount = lowStockRows.length;
  const initialLoading =
    branchesQ.isLoading || (Boolean(branchId) && inventoryQ.isLoading && !inventoryQ.data);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'out' && row.available > 0) return false;
      if (statusFilter === 'low' && !(row.available <= Math.max(1, row.reorderLevel))) return false;
      if (!term) return true;
      return [row.productName, row.genericName, row.brand, row.form, row.strength]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [rows, search, statusFilter]);

  useEffect(() => {
    if (rows.length === 0) {
      if (adjustForm.productId) {
        setAdjustForm((current) => ({ ...current, productId: '' }));
      }
      return;
    }
    if (rows.some((row) => row.productId === adjustForm.productId)) return;
    setAdjustForm((current) => ({ ...current, productId: rows[0].productId }));
  }, [adjustForm.productId, rows]);

  async function invalidateStock() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-inventory', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-low-stock', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-inventory-movements', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-invoices', branchId] }),
    ]);
  }

  const invoiceMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory/invoices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const issues = body?.error?.details
          ?.map((d: { field?: string; issue?: string }) => `${d.field}: ${d.issue}`)
          .join('; ');
        throw new Error(issues || body?.error?.message || 'Failed to record the invoice');
      }
      return body as { data: StockInvoiceDto };
    },
    onSuccess: async (body) => {
      setInvoiceMessage({
        tone: 'success',
        text: `Invoice ${body.data.invoiceNo} from ${body.data.vendorName} received — ${body.data.totalUnits} units across ${body.data.lines.length} product(s).`,
      });
      setInvoiceForm(EMPTY_INVOICE_FORM);
      await invalidateStock();
    },
    onError: (error) => {
      setInvoiceMessage({ tone: 'danger', text: error.message });
    },
  });

  const invoicesQ = useQuery({
    queryKey: ['admin-invoices', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory/invoices?limit=10`);
      if (!res.ok) throw new Error('Failed to load invoices');
      return (await res.json()) as Paginated<StockInvoiceDto>;
    },
  });
  const recentInvoices = invoicesQ.data?.data ?? [];

  const adjustMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory/adjust`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to adjust stock');
      return body as { data: BranchInventoryItemDto };
    },
    onSuccess: async (body) => {
      setAdjustMessage({ tone: 'success', text: `Adjusted stock for ${body.data.productName}.` });
      setAdjustForm((current) => ({
        ...current,
        quantityDelta: '',
        batchNo: '',
        expiry: '',
        reason: '',
      }));
      await invalidateStock();
    },
    onError: (error) => {
      setAdjustMessage({ tone: 'danger', text: error.message });
    },
  });

  function patchInvoiceLine(index: number, patch: Partial<InvoiceLineForm>) {
    setInvoiceForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvoiceMessage(undefined);

    const lines = invoiceForm.lines.filter((line) => line.productId);
    if (lines.length === 0) {
      setInvoiceMessage({ tone: 'danger', text: 'Add at least one product line.' });
      return;
    }

    const payload = ReceiveInvoiceSchema.safeParse({
      vendorName: invoiceForm.vendorName,
      invoiceNo: invoiceForm.invoiceNo,
      invoiceDate: invoiceForm.invoiceDate,
      note: invoiceForm.note || undefined,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        batchNo: line.batchNo || undefined,
        expiry: line.expiry || undefined,
        reorderLevel: line.reorderLevel || undefined,
        costKobo: line.costNaira ? Math.round(Number(line.costNaira) * 100) : undefined,
        priceKobo: line.priceNaira ? Math.round(Number(line.priceNaira) * 100) : undefined,
        visibleOnStorefront: line.visibility === '' ? undefined : line.visibility === 'visible',
      })),
    });

    if (!payload.success) {
      const issue = payload.error.issues[0];
      setInvoiceMessage({
        tone: 'danger',
        text: issue ? issue.message : 'Check the invoice form.',
      });
      return;
    }

    await invoiceMutation.mutateAsync(payload.data);
  }

  async function submitAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustMessage(undefined);

    const payload = AdjustInventorySchema.safeParse({
      productId: adjustForm.productId,
      quantityDelta: adjustForm.quantityDelta,
      reorderLevel: adjustForm.reorderLevel || undefined,
      batchNo: adjustForm.batchNo || undefined,
      expiry: adjustForm.expiry || undefined,
      reason: adjustForm.reason,
    });

    if (!payload.success) {
      setAdjustMessage({
        tone: 'danger',
        text: payload.error.issues[0]?.message ?? 'Check the stock adjustment form.',
      });
      return;
    }

    await adjustMutation.mutateAsync(payload.data);
  }

  const selectedAdjustInventory = inventoryByProductId.get(adjustForm.productId);
  const activityMovements = activityQ.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, pricing, receiving, adjustments, and a full audit trail — all on one page"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={!branchId || rows.length === 0}
              onClick={() => downloadExport('xlsx')}
            >
              Export Excel
            </Button>
            <Button
              variant="secondary"
              disabled={!branchId || rows.length === 0}
              onClick={() => downloadExport('csv')}
            >
              Export CSV
            </Button>
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className={selectClass}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {initialLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : branchesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load branches"
            description="Inventory depends on branch scope. Check the admin branch API or your staff permissions."
            icon={IconAlert}
          />
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches found"
            description="Create or seed a branch before inventory can be managed in the admin console."
            icon={IconBranch}
          />
        </Card>
      ) : inventoryQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load inventory"
            description="The inventory admin endpoint did not return data for the selected branch."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Tracked SKUs" value={rows.length} icon={IconInventory} tone="brand" />
            <StatCard label="Available units" value={totalAvailable} icon={IconCheck} tone="sky" />
            <StatCard label="Reserved units" value={totalReserved} icon={IconClock} tone="amber" />
            <StatCard label="Low stock items" value={lowStockCount} icon={IconAlert} tone="rose" />
            <StatCard
              label={`Expiring ≤${EXPIRING_SOON_DAYS}d`}
              value={expiringCount}
              icon={IconClock}
              tone="amber"
            />
            <StatCard
              label="Missing prices"
              value={prices.missingCount}
              icon={IconAlert}
              tone="rose"
            />
          </div>

          <Panel
            title="Manage stock"
            subtitle="Receive new stock or apply a manual correction — every action is audited"
            className="mb-6"
            action={
              <Button variant="secondary" onClick={() => setManageOpen((open) => !open)}>
                {manageOpen ? 'Hide' : 'Receive / adjust'}
              </Button>
            }
          >
            {manageOpen ? (
              <div className="space-y-8">
                {/* Receive stock — invoice (GRN) based */}
                {products.length === 0 ? (
                  <EmptyState
                    title="No products to receive"
                    description="Add products to the catalog before receiving stock into a branch."
                    icon={IconInventory}
                  />
                ) : (
                  <form className="space-y-4" onSubmit={submitInvoice}>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Receive stock — supplier invoice
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        One entry per invoice: vendor, invoice number, supply date, and every
                        product on it. This is the record the audit trail is built on.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className={labelClass} htmlFor="invoice-vendor">
                          Vendor
                        </label>
                        <input
                          id="invoice-vendor"
                          value={invoiceForm.vendorName}
                          onChange={(event) =>
                            setInvoiceForm((current) => ({
                              ...current,
                              vendorName: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder="e.g. Emzor Distribution"
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="invoice-no">
                          Invoice number
                        </label>
                        <input
                          id="invoice-no"
                          value={invoiceForm.invoiceNo}
                          onChange={(event) =>
                            setInvoiceForm((current) => ({
                              ...current,
                              invoiceNo: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder="e.g. INV-0231"
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="invoice-date">
                          Invoice date (supplied)
                        </label>
                        <input
                          id="invoice-date"
                          type="date"
                          value={invoiceForm.invoiceDate}
                          onChange={(event) =>
                            setInvoiceForm((current) => ({
                              ...current,
                              invoiceDate: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {invoiceForm.lines.map((line, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                        >
                          <div className="grid gap-2 sm:grid-cols-[2fr_0.8fr_1fr_1fr] sm:items-end">
                            <div>
                              <label className={labelClass} htmlFor={`line-product-${index}`}>
                                Product
                              </label>
                              <select
                                id={`line-product-${index}`}
                                value={line.productId}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { productId: event.target.value })
                                }
                                className={inputClass}
                              >
                                <option value="">Choose product…</option>
                                {products.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`line-qty-${index}`}>
                                Qty
                              </label>
                              <input
                                id={`line-qty-${index}`}
                                type="number"
                                min="1"
                                step="1"
                                value={line.quantity}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { quantity: event.target.value })
                                }
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`line-batch-${index}`}>
                                Batch no
                              </label>
                              <input
                                id={`line-batch-${index}`}
                                value={line.batchNo}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { batchNo: event.target.value })
                                }
                                className={inputClass}
                                placeholder="e.g. LOT-001"
                              />
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`line-expiry-${index}`}>
                                Expiry
                              </label>
                              <input
                                id={`line-expiry-${index}`}
                                type="date"
                                value={line.expiry}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { expiry: event.target.value })
                                }
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
                            <div>
                              <label className={labelClass} htmlFor={`line-cost-${index}`}>
                                Cost (₦)
                              </label>
                              <input
                                id={`line-cost-${index}`}
                                type="number"
                                min="0"
                                value={line.costNaira}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { costNaira: event.target.value })
                                }
                                className={inputClass}
                                placeholder="Optional"
                              />
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`line-price-${index}`}>
                                Selling (₦)
                              </label>
                              <input
                                id={`line-price-${index}`}
                                type="number"
                                min="0"
                                value={line.priceNaira}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { priceNaira: event.target.value })
                                }
                                className={inputClass}
                                placeholder="Optional"
                              />
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`line-reorder-${index}`}>
                                Reorder level
                              </label>
                              <input
                                id={`line-reorder-${index}`}
                                type="number"
                                min="0"
                                value={line.reorderLevel}
                                onChange={(event) =>
                                  patchInvoiceLine(index, { reorderLevel: event.target.value })
                                }
                                className={inputClass}
                                placeholder="Optional"
                              />
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`line-visibility-${index}`}>
                                Storefront
                              </label>
                              <select
                                id={`line-visibility-${index}`}
                                value={line.visibility}
                                onChange={(event) =>
                                  patchInvoiceLine(index, {
                                    visibility: event.target.value as InvoiceLineForm['visibility'],
                                  })
                                }
                                className={inputClass}
                              >
                                <option value="">Leave unchanged</option>
                                <option value="visible">Visible on storefront</option>
                                <option value="hidden">Hidden (POS only)</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setInvoiceForm((current) => ({
                                  ...current,
                                  lines:
                                    current.lines.length > 1
                                      ? current.lines.filter((_, i) => i !== index)
                                      : current.lines,
                                }))
                              }
                              disabled={invoiceForm.lines.length === 1}
                              className="mb-0.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setInvoiceForm((current) => ({
                            ...current,
                            lines: [...current.lines, EMPTY_INVOICE_LINE],
                          }))
                        }
                      >
                        Add product line
                      </Button>
                    </div>

                    <div>
                      <label className={labelClass} htmlFor="invoice-note">
                        Note
                      </label>
                      <input
                        id="invoice-note"
                        value={invoiceForm.note}
                        onChange={(event) =>
                          setInvoiceForm((current) => ({ ...current, note: event.target.value }))
                        }
                        className={inputClass}
                        placeholder="Optional receiving note"
                      />
                    </div>

                    <p className="text-xs text-slate-500">
                      Setting a selling price and “Visible on storefront” here publishes the product
                      online the moment it is received — no separate pricing step.
                    </p>

                    <InlineNotice message={invoiceMessage} />

                    <Button type="submit" disabled={invoiceMutation.isPending || !branchId}>
                      {invoiceMutation.isPending ? (
                        <>
                          <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Receiving
                          invoice…
                        </>
                      ) : (
                        'Receive invoice'
                      )}
                    </Button>
                  </form>
                )}

                {/* Adjust stock */}
                {rows.length === 0 ? (
                  <EmptyState
                    title="No stock to adjust yet"
                    description="Receive stock into this branch first, then manual adjustments can target those rows."
                    icon={IconInventory}
                  />
                ) : (
                  <form className="space-y-4" onSubmit={submitAdjust}>
                    <h3 className="text-sm font-semibold text-slate-900">Adjust stock</h3>
                    <div>
                      <label className={labelClass} htmlFor="adjust-product">
                        Inventory row
                      </label>
                      <select
                        id="adjust-product"
                        value={adjustForm.productId}
                        onChange={(event) =>
                          setAdjustForm((current) => ({
                            ...current,
                            productId: event.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        {rows.map((row) => (
                          <option key={row.productId} value={row.productId}>
                            {row.productName}
                          </option>
                        ))}
                      </select>
                      {selectedAdjustInventory ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedAdjustInventory.available} available,{' '}
                          {selectedAdjustInventory.reserved} reserved, reorder at{' '}
                          {selectedAdjustInventory.reorderLevel}.
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelClass} htmlFor="adjust-delta">
                          Quantity delta
                        </label>
                        <input
                          id="adjust-delta"
                          type="number"
                          step="1"
                          value={adjustForm.quantityDelta}
                          onChange={(event) =>
                            setAdjustForm((current) => ({
                              ...current,
                              quantityDelta: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder="Use negative values to reduce stock"
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="adjust-reorder">
                          Reorder level
                        </label>
                        <input
                          id="adjust-reorder"
                          type="number"
                          min="0"
                          step="1"
                          value={adjustForm.reorderLevel}
                          onChange={(event) =>
                            setAdjustForm((current) => ({
                              ...current,
                              reorderLevel: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder={
                            selectedAdjustInventory
                              ? `${selectedAdjustInventory.reorderLevel}`
                              : 'Optional'
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelClass} htmlFor="adjust-batch-no">
                          Batch number
                        </label>
                        <input
                          id="adjust-batch-no"
                          value={adjustForm.batchNo}
                          onChange={(event) =>
                            setAdjustForm((current) => ({
                              ...current,
                              batchNo: event.target.value,
                            }))
                          }
                          className={inputClass}
                          placeholder="Required for tracked batches"
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="adjust-expiry">
                          Expiry
                        </label>
                        <input
                          id="adjust-expiry"
                          type="date"
                          value={adjustForm.expiry}
                          onChange={(event) =>
                            setAdjustForm((current) => ({ ...current, expiry: event.target.value }))
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass} htmlFor="adjust-reason">
                        Reason
                      </label>
                      <input
                        id="adjust-reason"
                        value={adjustForm.reason}
                        onChange={(event) =>
                          setAdjustForm((current) => ({ ...current, reason: event.target.value }))
                        }
                        className={inputClass}
                        placeholder="Required audit note"
                      />
                    </div>

                    <InlineNotice message={adjustMessage} />

                    <Button type="submit" disabled={adjustMutation.isPending || !branchId}>
                      {adjustMutation.isPending ? (
                        <>
                          <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Saving…
                        </>
                      ) : (
                        'Apply adjustment'
                      )}
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Receive new stock or apply a manual correction. Both are recorded in the audit trail
                and the branch activity log below.
              </p>
            )}
          </Panel>

          <Panel
            title="Recent invoices"
            subtitle="Goods received — vendor, invoice number, and supply date for the audit trail"
            className="mb-6"
          >
            {invoicesQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : recentInvoices.length === 0 ? (
              <p className="text-sm text-slate-500">
                No invoices received yet — use “Receive stock” above to record the first delivery.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentInvoices.map((invoice) => (
                  <li key={invoice.id}>
                    <details className="rounded-xl border border-slate-200 bg-white">
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                          <span className="font-mono text-sm font-semibold text-slate-800">
                            {invoice.invoiceNo}
                          </span>
                          <span className="ml-2 text-sm text-slate-600">{invoice.vendorName}</span>
                        </span>
                        <span className="flex items-center gap-4 text-xs text-slate-500">
                          <span>Supplied {invoice.invoiceDate.slice(0, 10)}</span>
                          <span>
                            {invoice.lines.length} product(s) · {invoice.totalUnits} units
                          </span>
                          {invoice.receivedByName ? <span>by {invoice.receivedByName}</span> : null}
                        </span>
                      </summary>
                      <div className="border-t border-slate-100 px-4 py-3">
                        <ul className="space-y-1 text-sm text-slate-700">
                          {invoice.lines.map((line, index) => (
                            <li key={index} className="flex flex-wrap justify-between gap-2">
                              <span>
                                {line.productName} × {line.quantity}
                                {line.batchNo ? (
                                  <span className="text-xs text-slate-400">
                                    {' '}
                                    · batch {line.batchNo}
                                    {line.expiry ? ` · exp ${line.expiry.slice(0, 10)}` : ''}
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-xs text-slate-500">
                                {line.priceKobo != null ? formatKobo(line.priceKobo) : ''}
                                {line.visibleOnStorefront === true
                                  ? ' · visible'
                                  : line.visibleOnStorefront === false
                                    ? ' · hidden'
                                    : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {invoice.note ? (
                          <p className="mt-2 text-xs text-slate-500">Note: {invoice.note}</p>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Search + filter */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-md">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, generic, brand, form, or strength"
                aria-label="Search inventory"
                className={cn(inputClass, 'mt-0 pl-9')}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className={selectClass}
              aria-label="Filter by stock status"
            >
              <option value="all">All statuses</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
            <span className="text-xs text-slate-500">
              {filteredRows.length} of {rows.length} SKUs
            </span>
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title="No inventory rows yet"
                description="This branch has no stock entries yet. Use “Manage stock” above to receive the first inventory rows."
                icon={IconInventory}
              />
            </Card>
          ) : filteredRows.length === 0 ? (
            <Card>
              <EmptyState
                title="No SKUs match your filters"
                description="Try a different search term or clear the status filter."
                icon={IconInventory}
              />
            </Card>
          ) : (
            <TableCard>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Product</Th>
                  <Th>Status</Th>
                  <Th right>Available</Th>
                  <Th right>On hand</Th>
                  <Th right>Reserved</Th>
                  <Th right>Reorder</Th>
                  <Th>Next expiry</Th>
                  <Th right>Price</Th>
                  <Th>Storefront</Th>
                  <Th right>{''}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const priceRow = prices.pricesById.get(row.productId);
                  const draft = prices.draftFor(row.productId);
                  const open = expandedProductId === row.productId;
                  const exp = expiryInfo(row.nextExpiry);
                  return (
                    <Fragment key={row.productId}>
                      <tr
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-slate-50/60',
                          open && 'bg-brand-50/40',
                        )}
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setExpandedProductId((current) =>
                              current === row.productId ? null : row.productId,
                            );
                          }
                        }}
                        onClick={() =>
                          setExpandedProductId((current) =>
                            current === row.productId ? null : row.productId,
                          )
                        }
                      >
                        <Td>
                          <div className="font-semibold text-slate-900">{row.productName}</div>
                          <div className="text-xs text-slate-500">
                            {[row.genericName, row.brand, row.form, row.strength]
                              .filter(Boolean)
                              .join(' · ') || 'Catalog details unavailable'}
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={stockTone(row)}>{stockLabel(row)}</Badge>
                        </Td>
                        <Td right className="font-semibold text-slate-900">
                          {row.available}
                        </Td>
                        <Td right>{row.onHand}</Td>
                        <Td right>{row.reserved}</Td>
                        <Td right>{row.reorderLevel}</Td>
                        <Td>
                          <span className={exp.className}>
                            {exp.label}
                            {exp.hint ? (
                              <span className="ml-1.5 text-xs font-normal opacity-80">
                                ({exp.hint})
                              </span>
                            ) : null}
                          </span>
                        </Td>
                        <Td right>
                          {priceRow ? (
                            <span className="font-semibold text-slate-900">
                              {formatKobo(priceRow.priceKobo, priceRow.currency)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Not set</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={priceRow?.isAvailable ? 'success' : 'neutral'}>
                            {priceRow?.isAvailable ? 'Visible' : 'Hidden'}
                          </Badge>
                        </Td>
                        <Td right>
                          <span className="inline-flex text-slate-400">
                            <ChevronIcon open={open} />
                          </span>
                        </Td>
                      </tr>
                      {open ? (
                        <tr className="bg-slate-50/40">
                          <td colSpan={INVENTORY_COLSPAN} className="px-4 py-4">
                            <div className="grid gap-6 lg:grid-cols-2">
                              {/* Price editor */}
                              <div onClick={(event) => event.stopPropagation()}>
                                <div className="mb-2 text-sm font-semibold text-slate-900">
                                  Pricing (kobo)
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <div>
                                    <label className={labelClass}>Cost</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draft.costKobo}
                                      onChange={(event) =>
                                        prices.patchDraft(row.productId, {
                                          costKobo: event.target.value,
                                        })
                                      }
                                      className={inputClass}
                                      placeholder="Optional"
                                    />
                                  </div>
                                  <div>
                                    <label className={labelClass}>Selling</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draft.priceKobo}
                                      onChange={(event) =>
                                        prices.patchDraft(row.productId, {
                                          priceKobo: event.target.value,
                                        })
                                      }
                                      className={inputClass}
                                    />
                                  </div>
                                  <div>
                                    <label className={labelClass}>Compare at</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draft.compareAtKobo}
                                      onChange={(event) =>
                                        prices.patchDraft(row.productId, {
                                          compareAtKobo: event.target.value,
                                        })
                                      }
                                      className={inputClass}
                                      placeholder="Optional"
                                    />
                                  </div>
                                </div>
                                <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={draft.isAvailable}
                                    onChange={(event) =>
                                      prices.patchDraft(row.productId, {
                                        isAvailable: event.target.checked,
                                      })
                                    }
                                  />
                                  Visible on storefront
                                  <Badge tone={draft.isAvailable ? 'success' : 'neutral'}>
                                    {draft.isAvailable ? 'Visible' : 'Hidden'}
                                  </Badge>
                                </label>
                                <p className="mt-1 text-xs text-slate-500">
                                  Hidden products stay off the online store but can still be sold at
                                  the POS counter.
                                </p>
                                <div className="mt-3">
                                  <InlineNotice message={prices.message} />
                                </div>
                                <Button
                                  variant="secondary"
                                  className="mt-3"
                                  onClick={() => prices.saveRow(row.productId)}
                                  disabled={
                                    prices.isSaving && prices.savingProductId === row.productId
                                  }
                                >
                                  {prices.isSaving && prices.savingProductId === row.productId ? (
                                    <>
                                      <Spinner className="h-4 w-4" /> Saving…
                                    </>
                                  ) : priceRow ? (
                                    'Update price'
                                  ) : (
                                    'Create price'
                                  )}
                                </Button>
                              </div>

                              {/* Recent movements for this product */}
                              <div onClick={(event) => event.stopPropagation()}>
                                <div className="mb-2 text-sm font-semibold text-slate-900">
                                  Recent movements
                                </div>
                                {productMovementsQ.isLoading ? (
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Spinner /> Loading history…
                                  </div>
                                ) : (
                                  <MovementList movements={productMovementsQ.data?.data ?? []} />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </TableCard>
          )}

          {/* Branch-wide activity ledger */}
          <Panel
            title="Recent activity"
            subtitle="Every stock movement at this branch — receiving, adjustments, reservations, and sales"
            className="mt-6"
            action={
              <select
                value={activityType}
                onChange={(event) =>
                  setActivityType(event.target.value as StockMovementType | 'all')
                }
                className={selectClass}
                aria-label="Filter activity by type"
              >
                <option value="all">All types</option>
                {Object.values(StockMovementType).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            }
          >
            {activityQ.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : activityQ.isError ? (
              <EmptyState
                title="Activity unavailable"
                description="The stock-movement endpoint did not return data for this branch."
                icon={IconAlert}
              />
            ) : activityMovements.length === 0 ? (
              <EmptyState
                title="No stock movements yet"
                description="Receiving, adjustments, and sales will appear here as they happen."
                icon={IconClock}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 pr-3 font-semibold">Product</th>
                      <th className="py-2 pr-3 font-semibold">Type</th>
                      <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                      <th className="py-2 pr-3 font-semibold">Ref</th>
                      <th className="py-2 pr-3 font-semibold">Actor</th>
                      <th className="py-2 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activityMovements.map((m) => (
                      <tr key={m.id} className="text-slate-600">
                        <td className="py-2 pr-3 text-slate-400">{formatDateTime(m.at)}</td>
                        <td className="py-2 pr-3 font-medium text-slate-800">{m.productName}</td>
                        <td className="py-2 pr-3">
                          <Badge tone={MOVEMENT_TONE[m.type]}>{m.type}</Badge>
                        </td>
                        <td
                          className={cn(
                            'py-2 pr-3 text-right font-semibold',
                            m.quantity < 0 ? 'text-rose-600' : 'text-emerald-600',
                          )}
                        >
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">
                          {m.refType ?? 'system'}
                          {m.refId ? ` · ${short(m.refId)}` : ''}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">
                          {m.actorId ? short(m.actorId) : 'System'}
                        </td>
                        <td className="py-2 text-slate-500">{m.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activityQ.hasNextPage ? (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      onClick={() => activityQ.fetchNextPage()}
                      disabled={activityQ.isFetchingNextPage}
                    >
                      {activityQ.isFetchingNextPage ? (
                        <>
                          <Spinner className="h-4 w-4" /> Loading…
                        </>
                      ) : (
                        'Load more'
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
