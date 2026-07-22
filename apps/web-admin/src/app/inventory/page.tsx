'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BranchInventoryItemDto,
  BranchSummaryDto,
  Paginated,
  StockInvoiceDto,
  StockMovementDto,
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
import { useFileDownload } from '@/lib/use-download';
import { InvoiceReceiveForm } from '@/components/inventory/InvoiceReceiveForm';
import { RecentInvoices } from '@/components/inventory/RecentInvoices';
import { ActivityFeed } from '@/components/inventory/ActivityFeed';
import type { ComboboxProduct } from '@/components/ProductCombobox';

type AdminProductLookup = ComboboxProduct;

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

function expiryInfo(nextExpiry?: string): { className: string; label: string; hint?: string } {
  if (!nextExpiry) return { className: 'text-slate-400', label: '—' };
  const days = Math.ceil((new Date(nextExpiry).getTime() - Date.now()) / DAY_MS);
  const label = formatDateTime(nextExpiry);
  if (days <= 0) return { className: 'font-semibold text-rose-600', label, hint: 'Expired' };
  if (days <= EXPIRING_SOON_DAYS)
    return { className: 'font-semibold text-amber-700', label, hint: `${days}d left` };
  return { className: 'text-slate-500', label };
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
            <Badge tone="neutral">{m.type}</Badge>
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
  const [editingInvoice, setEditingInvoice] = useState<StockInvoiceDto | null>(null);
  const [manageMessage, setManageMessage] = useState<string | null>(null);
  const { download: runDownload, error: exportError } = useFileDownload();

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

  const prices = useBranchPrices(branchId, products);

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
    void runDownload(
      `/api/admin/branches/${branchId}/inventory/export?format=${format}`,
      `inventory-${branchId}.${format}`,
    );
  }

  const rows = inventoryQ.data?.data ?? [];
  const inventoryByProductId = useMemo(
    () => new Map(rows.map((row) => [row.productId, row])),
    [rows],
  );
  const lowStockRows = lowStockQ.data?.data ?? rows.filter((row) => row.isLowStock);
  const expiringCount = expiringQ.data?.data.length ?? 0;
  const totalAvailable = useMemo(() => rows.reduce((sum, row) => sum + row.available, 0), [rows]);
  const totalReserved = useMemo(() => rows.reduce((sum, row) => sum + row.reserved, 0), [rows]);
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

  async function invalidateStock() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-inventory', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-low-stock', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-expiring', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-inventory-movements', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-invoices', branchId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-prices', branchId] }),
    ]);
  }

  function onInvoiceSaved(message: string) {
    setManageMessage(message);
    setEditingInvoice(null);
    void invalidateStock();
  }

  function resumeDraft(invoice: StockInvoiceDto) {
    setEditingInvoice(invoice);
    setManageOpen(true);
    setManageMessage(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, pricing, receiving, and a full audit trail — all on one page"
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

      {exportError ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{exportError}</p>
      ) : null}

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
            title="Receive stock"
            subtitle="Record a supplier invoice — save it as a draft or receive it into stock"
            className="mb-6"
            action={
              <Button variant="secondary" onClick={() => setManageOpen((open) => !open)}>
                {manageOpen ? 'Hide' : 'Receive invoice'}
              </Button>
            }
          >
            {manageOpen ? (
              products.length === 0 ? (
                <EmptyState
                  title="No products to receive"
                  description="Add products to the catalog before receiving stock into a branch."
                  icon={IconInventory}
                />
              ) : (
                <div className="space-y-3">
                  {manageMessage ? (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {manageMessage}
                    </p>
                  ) : null}
                  <InvoiceReceiveForm
                    branchId={branchId}
                    products={products}
                    editingInvoice={editingInvoice}
                    onSaved={onInvoiceSaved}
                    onCancelEdit={() => setEditingInvoice(null)}
                  />
                </div>
              )
            ) : (
              <p className="text-sm text-slate-500">
                Record a supplier invoice (goods-received note). Receiving applies stock and any
                per-line pricing; both are captured in the audit trail and the activity log below.
              </p>
            )}
          </Panel>

          <Panel
            title="Recent invoices"
            subtitle="Goods received and drafts — vendor, invoice number, payment status, and supply date"
            className="mb-6"
          >
            <RecentInvoices
              branchId={branchId}
              onResume={resumeDraft}
              onChanged={invalidateStock}
            />
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
                description="This branch has no stock entries yet. Use “Receive stock” above to record the first delivery."
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
                                {prices.message ? (
                                  <p
                                    className={cn(
                                      'mt-3 rounded-lg px-3 py-2 text-sm',
                                      prices.message.tone === 'success'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-rose-50 text-rose-700',
                                    )}
                                  >
                                    {prices.message.text}
                                  </p>
                                ) : null}
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

          <ActivityFeed branchId={branchId} />
        </>
      )}
    </div>
  );
}
