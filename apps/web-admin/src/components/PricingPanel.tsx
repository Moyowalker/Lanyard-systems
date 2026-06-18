'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UpsertPriceSchema } from '@lanyard/contracts';

import { IconAlert, IconCheck, IconPricing } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Spinner,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';
import { formatKobo } from '@/lib/format';

/** Minimal product shape the pricing editor needs (shared with the inventory page). */
export type PricingProduct = {
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
  costKobo?: number;
  compareAtKobo?: number;
  currency: string;
  isAvailable: boolean;
};

type PriceDraft = {
  priceKobo: string;
  costKobo: string;
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

/**
 * Per-branch price book editor — selling price, cost price, compare-at, and
 * sellable availability. Used as the "Pricing" tab inside the Inventory page so
 * stock and pricing live on one screen.
 */
export function PricingPanel({
  branchId,
  products,
}: {
  branchId: string;
  products: PricingProduct[];
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [message, setMessage] = useState<FormMessage>();
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  const pricesQ = useQuery({
    queryKey: ['admin-prices', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/prices`);
      if (!res.ok) throw new Error('Failed to load prices');
      return (await res.json()) as { data: PriceRow[] };
    },
  });

  const prices = useMemo(() => pricesQ.data?.data ?? [], [pricesQ.data]);

  useEffect(() => {
    if (!branchId || products.length === 0) return;
    const priceMap = new Map(prices.map((row) => [row.productId, row]));
    const nextDrafts: Record<string, PriceDraft> = {};
    for (const product of products) {
      const row = priceMap.get(product.id);
      nextDrafts[product.id] = {
        priceKobo: row ? String(row.priceKobo) : '',
        costKobo: row?.costKobo ? String(row.costKobo) : '',
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
    onSuccess: async () => {
      setMessage({ tone: 'success', text: 'Price saved.' });
      setSavingProductId(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-prices', branchId] });
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
      [...products]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((product) => ({
          product,
          current: priceMap.get(product.id),
          draft:
            drafts[product.id] ??
            { priceKobo: '', costKobo: '', compareAtKobo: '', isAvailable: true },
        })),
    [drafts, priceMap, products],
  );

  const configuredCount = prices.length;
  const availableCount = prices.filter((row) => row.isAvailable).length;
  const missingCount = Math.max(0, products.length - configuredCount);

  async function saveRow(productId: string) {
    const draft = drafts[productId];
    setMessage(undefined);
    const parsed = UpsertPriceSchema.safeParse({
      productId,
      priceKobo: Number(draft?.priceKobo),
      costKobo: draft?.costKobo ? Number(draft.costKobo) : undefined,
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

  function patchDraft(productId: string, patch: Partial<PriceDraft>, fallback: PriceDraft) {
    setDrafts((current) => ({
      ...current,
      [productId]: { ...(current[productId] ?? fallback), ...patch },
    }));
  }

  if (pricesQ.isLoading && !pricesQ.data) {
    return (
      <Card className="p-5">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (pricesQ.isError) {
    return (
      <Card>
        <EmptyState
          title="Could not load pricing"
          description="The pricing admin endpoint did not return data for the selected branch."
          icon={IconAlert}
        />
      </Card>
    );
  }

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Configured prices" value={configuredCount} icon={IconPricing} tone="brand" />
        <StatCard label="Available to sell" value={availableCount} icon={IconCheck} tone="sky" />
        <StatCard label="Missing price rows" value={missingCount} icon={IconAlert} tone="rose" />
        <StatCard label="Catalog products" value={products.length} icon={IconPricing} tone="amber" />
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
            <Th>Cost (kobo)</Th>
            <Th>Selling (kobo)</Th>
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
                    <div className="font-semibold text-slate-900">
                      {formatKobo(current.priceKobo, current.currency)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {current.costKobo != null
                        ? `cost ${formatKobo(current.costKobo, current.currency)}`
                        : 'no cost set'}
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
                      patchDraft(product.id, { isAvailable: event.target.checked }, draft)
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
                  value={draft.costKobo}
                  onChange={(event) => patchDraft(product.id, { costKobo: event.target.value }, draft)}
                  className={inputClass}
                  placeholder="Optional"
                />
              </Td>
              <Td>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.priceKobo}
                  onChange={(event) =>
                    patchDraft(product.id, { priceKobo: event.target.value }, draft)
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
                    patchDraft(product.id, { compareAtKobo: event.target.value }, draft)
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
  );
}
