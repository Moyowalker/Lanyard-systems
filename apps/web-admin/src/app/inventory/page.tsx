'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdjustInventorySchema,
  BranchInventoryItemDto,
  BranchSummaryDto,
  Paginated,
  ReceiveInventorySchema,
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
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { PricingPanel } from '@/components/PricingPanel';

type AdminProductLookup = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
};

type ReceiveFormState = {
  productId: string;
  quantity: string;
  reorderLevel: string;
  batchNo: string;
  expiry: string;
  reason: string;
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

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function stockTone(row: BranchInventoryItemDto): 'success' | 'warn' | 'danger' {
  if (row.available <= 0) return 'danger';
  if (row.available <= Math.max(1, row.reorderLevel)) return 'warn';
  return 'success';
}

const EXPIRING_SOON_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

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

type InventoryTab = 'stock' | 'pricing';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [tab, setTab] = useState<InventoryTab>('stock');
  const [receiveForm, setReceiveForm] = useState<ReceiveFormState>({
    productId: '',
    quantity: '',
    reorderLevel: '',
    batchNo: '',
    expiry: '',
    reason: '',
  });
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    productId: '',
    quantityDelta: '',
    reorderLevel: '',
    batchNo: '',
    expiry: '',
    reason: '',
  });
  const [receiveMessage, setReceiveMessage] = useState<FormMessage>();
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
  const products = productsQ.data?.data ?? [];

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

  function downloadExport(format: 'xlsx' | 'csv') {
    if (!branchId) return;
    window.open(`/api/admin/branches/${branchId}/inventory/export?format=${format}`, '_blank');
  }

  const rows = inventoryQ.data?.data ?? [];
  const productById = new Map(products.map((product) => [product.id, product]));
  const inventoryByProductId = new Map(rows.map((row) => [row.productId, row]));
  const lowStockRows = lowStockQ.data?.data ?? rows.filter((row) => row.isLowStock);
  const expiringCount = expiringQ.data?.data.length ?? 0;
  const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);
  const totalReserved = rows.reduce((sum, row) => sum + row.reserved, 0);
  const lowStockCount = lowStockRows.length;
  const initialLoading =
    branchesQ.isLoading || (Boolean(branchId) && inventoryQ.isLoading && !inventoryQ.data);

  useEffect(() => {
    if (products.length === 0) return;
    if (products.some((product) => product.id === receiveForm.productId)) return;
    setReceiveForm((current) => ({ ...current, productId: products[0].id }));
  }, [products, receiveForm.productId]);

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

  const receiveMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory/receive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to receive stock');
      return body as { data: BranchInventoryItemDto };
    },
    onSuccess: async (body) => {
      setReceiveMessage({ tone: 'success', text: `Received stock for ${body.data.productName}.` });
      setReceiveForm((current) => ({
        ...current,
        quantity: '',
        batchNo: '',
        expiry: '',
        reason: '',
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-inventory', branchId] }),
        queryClient.invalidateQueries({ queryKey: ['admin-low-stock', branchId] }),
      ]);
    },
    onError: (error) => {
      setReceiveMessage({ tone: 'danger', text: error.message });
    },
  });

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-inventory', branchId] }),
        queryClient.invalidateQueries({ queryKey: ['admin-low-stock', branchId] }),
      ]);
    },
    onError: (error) => {
      setAdjustMessage({ tone: 'danger', text: error.message });
    },
  });

  async function submitReceive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceiveMessage(undefined);

    const payload = ReceiveInventorySchema.safeParse({
      productId: receiveForm.productId,
      quantity: receiveForm.quantity,
      reorderLevel: receiveForm.reorderLevel || undefined,
      batchNo: receiveForm.batchNo || undefined,
      expiry: receiveForm.expiry || undefined,
      reason: receiveForm.reason || undefined,
    });

    if (!payload.success) {
      setReceiveMessage({
        tone: 'danger',
        text: payload.error.issues[0]?.message ?? 'Check the receive stock form.',
      });
      return;
    }

    await receiveMutation.mutateAsync(payload.data);
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

  const selectedReceiveInventory = inventoryByProductId.get(receiveForm.productId);
  const selectedAdjustInventory = inventoryByProductId.get(adjustForm.productId);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Branch stock levels, manual receiving, adjustments, and low-stock pressure"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'stock' ? (
              <>
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
              </>
            ) : null}
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
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

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {(['stock', 'pricing'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm'
                : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700'
            }
          >
            {key === 'stock' ? 'Stock' : 'Pricing'}
          </button>
        ))}
      </div>

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
      ) : tab === 'pricing' ? (
        <PricingPanel branchId={branchId} products={products} />
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
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-3">
            <Panel
              title="Receive stock"
              subtitle="Add new stock to this branch and optionally capture batch details"
            >
              {productsQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Spinner /> Loading product catalog…
                </div>
              ) : productsQ.isError ? (
                <EmptyState
                  title="Products unavailable"
                  description="The receive form needs catalog products from the admin API."
                  icon={IconAlert}
                />
              ) : products.length === 0 ? (
                <EmptyState
                  title="No products to receive"
                  description="Add products to the catalog before receiving stock into a branch."
                  icon={IconInventory}
                />
              ) : (
                <form className="space-y-4" onSubmit={submitReceive}>
                  <div>
                    <label className={labelClass} htmlFor="receive-product">
                      Product
                    </label>
                    <select
                      id="receive-product"
                      value={receiveForm.productId}
                      onChange={(event) =>
                        setReceiveForm((current) => ({ ...current, productId: event.target.value }))
                      }
                      className={inputClass}
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedReceiveInventory
                        ? `${selectedReceiveInventory.available} available now at this branch.`
                        : 'This product has no existing inventory row for the selected branch.'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="receive-quantity">
                        Quantity
                      </label>
                      <input
                        id="receive-quantity"
                        type="number"
                        min="1"
                        step="1"
                        value={receiveForm.quantity}
                        onChange={(event) =>
                          setReceiveForm((current) => ({
                            ...current,
                            quantity: event.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="e.g. 24"
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="receive-reorder">
                        Reorder level
                      </label>
                      <input
                        id="receive-reorder"
                        type="number"
                        min="0"
                        step="1"
                        value={receiveForm.reorderLevel}
                        onChange={(event) =>
                          setReceiveForm((current) => ({
                            ...current,
                            reorderLevel: event.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="e.g. 8"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="receive-batch-no">
                        Batch number
                      </label>
                      <input
                        id="receive-batch-no"
                        value={receiveForm.batchNo}
                        onChange={(event) =>
                          setReceiveForm((current) => ({ ...current, batchNo: event.target.value }))
                        }
                        className={inputClass}
                        placeholder="e.g. LOT-001"
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="receive-expiry">
                        Expiry
                      </label>
                      <input
                        id="receive-expiry"
                        type="date"
                        value={receiveForm.expiry}
                        onChange={(event) =>
                          setReceiveForm((current) => ({ ...current, expiry: event.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="receive-reason">
                      Note
                    </label>
                    <input
                      id="receive-reason"
                      value={receiveForm.reason}
                      onChange={(event) =>
                        setReceiveForm((current) => ({ ...current, reason: event.target.value }))
                      }
                      className={inputClass}
                      placeholder="Optional receiving note"
                    />
                  </div>

                  {selectedReceiveInventory?.batchCount ? (
                    <p className="text-xs text-slate-500">
                      This SKU already has tracked batches. Enter both batch number and expiry to
                      keep the ledger aligned.
                    </p>
                  ) : null}

                  <InlineNotice message={receiveMessage} />

                  <Button type="submit" disabled={receiveMutation.isPending || !branchId}>
                    {receiveMutation.isPending ? (
                      <>
                        <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Receiving…
                      </>
                    ) : (
                      'Receive stock'
                    )}
                  </Button>
                </form>
              )}
            </Panel>

            <Panel
              title="Adjust stock"
              subtitle="Apply manual corrections without losing reserved-stock safeguards"
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No stock to adjust yet"
                  description="Receive stock into this branch first, then manual adjustments can target those rows."
                  icon={IconInventory}
                />
              ) : (
                <form className="space-y-4" onSubmit={submitAdjust}>
                  <div>
                    <label className={labelClass} htmlFor="adjust-product">
                      Inventory row
                    </label>
                    <select
                      id="adjust-product"
                      value={adjustForm.productId}
                      onChange={(event) =>
                        setAdjustForm((current) => ({ ...current, productId: event.target.value }))
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
                          setAdjustForm((current) => ({ ...current, batchNo: event.target.value }))
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

                  {selectedAdjustInventory?.batchCount ? (
                    <p className="text-xs text-slate-500">
                      This SKU is batch-tracked. Adjust the specific batch to avoid orphaning expiry
                      counts.
                    </p>
                  ) : null}

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
            </Panel>

            <Panel
              title="Low-stock view"
              subtitle="Products that are out of stock or at their branch reorder threshold"
            >
              {lowStockQ.isLoading && !lowStockQ.data ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : lowStockQ.isError ? (
                <EmptyState
                  title="Low-stock view unavailable"
                  description="The inventory low-stock endpoint did not return data for this branch."
                  icon={IconAlert}
                />
              ) : lowStockRows.length === 0 ? (
                <EmptyState
                  title="No low-stock products"
                  description="Everything in this branch is currently above the configured reorder threshold."
                  icon={IconCheck}
                />
              ) : (
                <div className="space-y-3">
                  {lowStockRows.map((row) => (
                    <div
                      key={`low-stock-${row.productId}`}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{row.productName}</p>
                          <p className="text-xs text-slate-500">
                            {[row.genericName, row.brand, row.form, row.strength]
                              .filter(Boolean)
                              .join(' · ') || 'Catalog details unavailable'}
                          </p>
                        </div>
                        <Badge tone={stockTone(row)}>
                          {row.available <= 0 ? 'Out of stock' : 'Low stock'}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-500">
                        <div>
                          <span className="block font-semibold text-slate-700">Available</span>
                          {row.available}
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700">Reorder</span>
                          {row.reorderLevel}
                        </div>
                        <div>
                          <span className="block font-semibold text-slate-700">Next expiry</span>
                          {formatDateTime(row.nextExpiry)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title="No inventory rows yet"
                description="This branch has no stock entries yet. Use the receive form above to create the first inventory rows."
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
                  <Th right>Batches</Th>
                  <Th>Next expiry</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.productId} className="transition-colors hover:bg-slate-50/60">
                    <Td>
                      <div className="font-semibold text-slate-900">{row.productName}</div>
                      <div className="text-xs text-slate-500">
                        {[row.genericName, row.brand, row.form, row.strength]
                          .filter(Boolean)
                          .join(' · ') || 'Catalog details unavailable'}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={stockTone(row)}>
                        {row.available <= 0
                          ? 'Out of stock'
                          : row.available <= Math.max(1, row.reorderLevel)
                            ? 'Low stock'
                            : 'Healthy'}
                      </Badge>
                    </Td>
                    <Td right className="font-semibold text-slate-900">
                      {row.available}
                    </Td>
                    <Td right>{row.onHand}</Td>
                    <Td right>{row.reserved}</Td>
                    <Td right>{row.reorderLevel}</Td>
                    <Td right>{row.batchCount}</Td>
                    <Td>
                      {(() => {
                        const exp = expiryInfo(row.nextExpiry);
                        return (
                          <span className={exp.className}>
                            {exp.label}
                            {exp.hint ? (
                              <span className="ml-1.5 text-xs font-normal opacity-80">
                                ({exp.hint})
                              </span>
                            ) : null}
                          </span>
                        );
                      })()}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </>
      )}
    </div>
  );
}
