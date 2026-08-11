'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdjustInventorySchema,
  BranchInventoryItemDto,
  BranchSummaryDto,
  Paginated,
  StockMovementDto,
  StockMovementType,
} from '@lanyard/contracts';

import { IconAlert, IconBranch, IconInventory } from '@/components/icons';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  Spinner,
  cn,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { ProductCombobox, type ComboboxProduct } from '@/components/ProductCombobox';

type AdjustForm = {
  productId: string;
  quantityDelta: string;
  reorderLevel: string;
  batchNo: string;
  expiry: string;
  reason: string;
};

const EMPTY: AdjustForm = {
  productId: '',
  quantityDelta: '',
  reorderLevel: '',
  batchNo: '',
  expiry: '',
  reason: '',
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500';

function short(id?: string): string {
  return id ? id.slice(-6) : '—';
}

/**
 * Restricted stock-adjustments page (gated on `inventory:adjust`). Branch selector +
 * product combobox + the manual-correction form + a log of recent ADJUST movements.
 * The adjust form used to live on the inventory page; it is now here so read-only
 * inventory staff never see an adjust surface.
 */
export default function AdjustmentsPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState<AdjustForm>(EMPTY);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'adjustments'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches/available?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });

  const productsQ = useQuery({
    queryKey: ['admin-products', 'adjustments'],
    queryFn: async () => {
      const res = await fetch('/api/admin/catalog/products?limit=100');
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<ComboboxProduct>;
    },
  });

  const branches = branchesQ.data?.data ?? [];
  const products = useMemo(() => productsQ.data?.data ?? [], [productsQ.data]);

  useEffect(() => {
    if (!branchId && branches[0]?.id) setBranchId(branches[0].id);
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

  const adjustmentsQ = useQuery({
    queryKey: ['admin-inventory-movements', branchId, StockMovementType.ADJUST],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/movements?limit=25&type=${StockMovementType.ADJUST}`,
      );
      if (!res.ok) throw new Error('Failed to load adjustments');
      return (await res.json()) as Paginated<StockMovementDto>;
    },
  });

  const inventoryByProductId = useMemo(
    () => new Map((inventoryQ.data?.data ?? []).map((row) => [row.productId, row])),
    [inventoryQ.data],
  );
  const selected = inventoryByProductId.get(form.productId);
  const adjustments = adjustmentsQ.data?.data ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const parsed = AdjustInventorySchema.safeParse({
      productId: form.productId,
      quantityDelta: form.quantityDelta,
      reorderLevel: form.reorderLevel || undefined,
      batchNo: form.batchNo || undefined,
      expiry: form.expiry || undefined,
      reason: form.reason,
    });
    if (!parsed.success) {
      setMessage({
        tone: 'danger',
        text: parsed.error.issues[0]?.message ?? 'Check the stock adjustment form.',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory/adjust`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to adjust stock');
      setMessage({ tone: 'success', text: `Adjusted stock for ${body.data.productName}.` });
      setForm((current) => ({
        ...current,
        quantityDelta: '',
        batchNo: '',
        expiry: '',
        reason: '',
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-inventory', branchId] }),
        queryClient.invalidateQueries({ queryKey: ['admin-inventory-movements', branchId] }),
      ]);
    } catch (err) {
      setMessage({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Failed to adjust stock',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock adjustments"
        subtitle="Apply an audited manual correction to branch stock — restricted to authorised staff"
        actions={
          branches.length > 0 ? (
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
          ) : null
        }
      />

      {branchesQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches found"
            description="Create or seed a branch before stock can be adjusted."
            icon={IconBranch}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Adjust stock" subtitle="Every adjustment is written to the audit trail">
            {products.length === 0 ? (
              <EmptyState
                title="No products"
                description="Add products to the catalog before adjusting stock."
                icon={IconInventory}
              />
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div>
                  <label className={labelClass}>Product</label>
                  <div className="mt-1">
                    <ProductCombobox
                      products={products}
                      value={form.productId}
                      onChange={(productId) => setForm((c) => ({ ...c, productId }))}
                    />
                  </div>
                  {selected ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {selected.available} available, {selected.reserved} reserved, reorder at{' '}
                      {selected.reorderLevel}.
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
                      value={form.quantityDelta}
                      onChange={(e) => setForm((c) => ({ ...c, quantityDelta: e.target.value }))}
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
                      value={form.reorderLevel}
                      onChange={(e) => setForm((c) => ({ ...c, reorderLevel: e.target.value }))}
                      className={inputClass}
                      placeholder={selected ? `${selected.reorderLevel}` : 'Optional'}
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
                      value={form.batchNo}
                      onChange={(e) => setForm((c) => ({ ...c, batchNo: e.target.value }))}
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
                      value={form.expiry}
                      onChange={(e) => setForm((c) => ({ ...c, expiry: e.target.value }))}
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
                    value={form.reason}
                    onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))}
                    className={inputClass}
                    placeholder="Required audit note"
                  />
                </div>

                {message ? (
                  <p
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      message.tone === 'success'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700',
                    )}
                  >
                    {message.text}
                  </p>
                ) : null}

                <Button type="submit" disabled={saving || !branchId || !form.productId}>
                  {saving ? (
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
            title="Recent adjustments"
            subtitle="Manual corrections at this branch, newest first"
          >
            {adjustmentsQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : adjustmentsQ.isError ? (
              <EmptyState
                title="Adjustments unavailable"
                description="The stock-movement endpoint did not return data for this branch."
                icon={IconAlert}
              />
            ) : adjustments.length === 0 ? (
              <EmptyState
                title="No adjustments yet"
                description="Manual corrections applied here will appear in this log."
                icon={IconInventory}
              />
            ) : (
              <ul className="space-y-2">
                {adjustments.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'font-semibold',
                            m.quantity < 0 ? 'text-rose-600' : 'text-emerald-600',
                          )}
                        >
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                        <span className="font-medium text-slate-800">{m.productName}</span>
                      </div>
                      {m.reason ? <div className="text-xs text-slate-500">{m.reason}</div> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-400">
                      <div>{formatDateTime(m.at)}</div>
                      <div>by {m.actorId ? short(m.actorId) : 'System'}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
