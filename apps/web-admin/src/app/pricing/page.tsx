'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UpsertPriceSchema, type Paginated } from '@lanyard/contracts';

import { IconAlert, IconBranch, IconCatalog, IconCheck, IconPricing } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  Spinner,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';
import { formatKobo } from '@/lib/format';

type BranchOption = { id: string; name: string };

type AdminProductLookup = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
};

type PriceRow = {
  productId: string;
  priceKobo: number;
  compareAtKobo?: number;
  currency: string;
  isAvailable: boolean;
};

type PriceDraft = {
  priceKobo: string;
  compareAtKobo: string;
  isAvailable: boolean;
};

type FormMessage = { tone: 'success' | 'danger'; text: string };

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

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

export default function PricingPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [message, setMessage] = useState<FormMessage>();
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'pricing'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchOption>;
    },
  });

  const productsQ = useQuery({
    queryKey: ['admin-products', 'pricing'],
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

  const pricesQ = useQuery({
    queryKey: ['admin-prices', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/prices`);
      if (!res.ok) throw new Error('Failed to load prices');
      return (await res.json()) as { data: PriceRow[] };
    },
  });

  const prices = pricesQ.data?.data ?? [];

  useEffect(() => {
    if (!branchId || products.length === 0) return;

    const priceMap = new Map(prices.map((row) => [row.productId, row]));
    const nextDrafts: Record<string, PriceDraft> = {};
    for (const product of products) {
      const row = priceMap.get(product.id);
      nextDrafts[product.id] = {
        priceKobo: row ? String(row.priceKobo) : '',
        compareAtKobo: row?.compareAtKobo ? String(row.compareAtKobo) : '',
        isAvailable: row?.isAvailable ?? true,
      };
    }
    setDrafts(nextDrafts);
  }, [branchId, prices, products]);

  const priceMutation = useMutation({
    mutationFn: async (payload: { productId: string; body: unknown }) => {
      const res = await fetch(`/api/admin/branches/${branchId}/prices`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Price save failed');
      return body;
    },
    onSuccess: async (_body, variables) => {
      setMessage({ tone: 'success', text: 'Price saved.' });
      setSavingProductId(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-prices', branchId] });
      setDrafts((current) => ({
        ...current,
        [variables.productId]: current[variables.productId],
      }));
    },
    onError: (error) => {
      setSavingProductId(null);
      setMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Price save failed',
      });
    },
  });

  const priceMap = useMemo(() => new Map(prices.map((row) => [row.productId, row])), [prices]);
  const rows = useMemo(
    () =>
      [...products].sort((left, right) => left.name.localeCompare(right.name)).map((product) => ({
        product,
        current: priceMap.get(product.id),
        draft: drafts[product.id] ?? { priceKobo: '', compareAtKobo: '', isAvailable: true },
      })),
    [drafts, priceMap, products],
  );

  const configuredCount = prices.length;
  const availableCount = prices.filter((row) => row.isAvailable).length;
  const missingCount = Math.max(0, products.length - configuredCount);
  const initialLoading =
    branchesQ.isLoading || productsQ.isLoading || (Boolean(branchId) && pricesQ.isLoading && !pricesQ.data);

  async function saveRow(productId: string) {
    const draft = drafts[productId];
    setMessage(undefined);
    const parsed = UpsertPriceSchema.safeParse({
      productId,
      priceKobo: Number(draft?.priceKobo),
      compareAtKobo: draft?.compareAtKobo ? Number(draft.compareAtKobo) : undefined,
      isAvailable: draft?.isAvailable ?? true,
    });

    if (!parsed.success) {
      setMessage({
        tone: 'danger',
        text: parsed.error.issues[0]?.message ?? 'Check the pricing row before saving.',
      });
      return;
    }

    setSavingProductId(productId);
    await priceMutation.mutateAsync({ productId, body: parsed.data });
  }

  return (
    <div>
      <PageHeader
        title="Pricing"
        subtitle="Per-branch price books and sellable availability"
        actions={
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
      ) : branchesQ.isError || productsQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load pricing context"
            description="Pricing depends on both branches and products being available to the admin app."
            icon={IconAlert}
          />
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches found"
            description="Create a branch before configuring branch-level pricing."
            icon={IconBranch}
          />
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            title="No products found"
            description="Pricing is configured against catalog products, so the catalog must exist first."
            icon={IconCatalog}
          />
        </Card>
      ) : pricesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load pricing"
            description="The pricing admin endpoint did not return data for the selected branch."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Configured prices" value={configuredCount} icon={IconPricing} tone="brand" />
            <StatCard label="Available to sell" value={availableCount} icon={IconCheck} tone="sky" />
            <StatCard label="Missing price rows" value={missingCount} icon={IconAlert} tone="rose" />
            <StatCard label="Catalog products" value={products.length} icon={IconCatalog} tone="amber" />
          </div>

          <div className="mb-4">
            <InlineNotice message={message} />
          </div>

          <TableCard>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Product</Th>
                <Th>Current</Th>
                <Th>Availability</Th>
                <Th>Price (kobo)</Th>
                <Th>Compare at (kobo)</Th>
                <Th right>{''}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ product, current, draft }) => (
                <tr key={product.id} className="transition-colors hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-900">{product.name}</div>
                    <div className="text-xs text-slate-500">
                      {[product.genericName, product.brand, product.form, product.strength]
                        .filter(Boolean)
                        .join(' · ') || 'Catalog details unavailable'}
                    </div>
                  </Td>
                  <Td>
                    {current ? (
                      <div>
                        <div className="font-semibold text-slate-900">{formatKobo(current.priceKobo, current.currency)}</div>
                        <div className="text-xs text-slate-500">
                          {current.compareAtKobo ? formatKobo(current.compareAtKobo, current.currency) : 'No compare-at'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">Not configured</span>
                    )}
                  </Td>
                  <Td>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={draft.isAvailable}
                        onChange={(event) =>
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [product.id]: {
                              ...(currentDrafts[product.id] ?? draft),
                              isAvailable: event.target.checked,
                            },
                          }))
                        }
                      />
                      <Badge tone={draft.isAvailable ? 'success' : 'neutral'}>
                        {draft.isAvailable ? 'Sellable' : 'Hidden'}
                      </Badge>
                    </label>
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.priceKobo}
                      onChange={(event) =>
                        setDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [product.id]: {
                            ...(currentDrafts[product.id] ?? draft),
                            priceKobo: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.compareAtKobo}
                      onChange={(event) =>
                        setDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [product.id]: {
                            ...(currentDrafts[product.id] ?? draft),
                            compareAtKobo: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                      placeholder="Optional"
                    />
                  </Td>
                  <Td right>
                    <Button
                      variant="secondary"
                      onClick={() => saveRow(product.id)}
                      disabled={priceMutation.isPending && savingProductId === product.id}
                    >
                      {priceMutation.isPending && savingProductId === product.id ? (
                        <>
                          <Spinner className="h-4 w-4" /> Saving...
                        </>
                      ) : current ? (
                        'Update'
                      ) : (
                        'Create'
                      )}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      )}
    </div>
  );
}