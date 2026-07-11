'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UpsertPriceSchema } from '@lanyard/contracts';

/** Minimal product shape the pricing editor needs (shared with the inventory page). */
export type PricingProduct = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
};

export type PriceRow = {
  productId: string;
  priceKobo: number;
  costKobo?: number;
  compareAtKobo?: number;
  currency: string;
  isAvailable: boolean;
};

export type PriceDraft = {
  priceKobo: string;
  costKobo: string;
  compareAtKobo: string;
  isAvailable: boolean;
};

export type PriceMessage = { tone: 'success' | 'danger'; text: string };

const EMPTY_DRAFT: PriceDraft = {
  priceKobo: '',
  costKobo: '',
  compareAtKobo: '',
  isAvailable: true,
};

/**
 * Per-branch price book data layer — loads the branch price rows, keeps an editable
 * draft per product, and saves a single row. Extracted so the inventory page can edit
 * prices inline alongside stock (stock + pricing on one screen).
 */
export function useBranchPrices(branchId: string, products: PricingProduct[]) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [message, setMessage] = useState<PriceMessage>();
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
  const pricesById = useMemo(() => new Map(prices.map((row) => [row.productId, row])), [prices]);

  useEffect(() => {
    if (!branchId || products.length === 0) return;
    const nextDrafts: Record<string, PriceDraft> = {};
    for (const product of products) {
      const row = pricesById.get(product.id);
      nextDrafts[product.id] = {
        priceKobo: row ? String(row.priceKobo) : '',
        costKobo: row?.costKobo ? String(row.costKobo) : '',
        compareAtKobo: row?.compareAtKobo ? String(row.compareAtKobo) : '',
        isAvailable: row?.isAvailable ?? true,
      };
    }
    setDrafts(nextDrafts);
  }, [branchId, pricesById, products]);

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

  function draftFor(productId: string): PriceDraft {
    return drafts[productId] ?? EMPTY_DRAFT;
  }

  function patchDraft(productId: string, patch: Partial<PriceDraft>) {
    setDrafts((current) => ({
      ...current,
      [productId]: { ...(current[productId] ?? EMPTY_DRAFT), ...patch },
    }));
  }

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

  return {
    pricesById,
    configuredCount: prices.length,
    availableCount: prices.filter((row) => row.isAvailable).length,
    missingCount: Math.max(0, products.length - prices.length),
    draftFor,
    patchDraft,
    saveRow,
    savingProductId,
    isSaving: priceMutation.isPending,
    message,
    setMessage,
    isLoading: pricesQ.isLoading && !pricesQ.data,
    isError: pricesQ.isError,
  };
}
