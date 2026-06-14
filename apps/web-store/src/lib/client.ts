'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CartDto, MeResponse, ReorderResultDto } from '@lanyard/contracts';

export class AuthRequiredError extends Error {
  constructor() {
    super('AUTH_REQUIRED');
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      return asJson<MeResponse>(res);
    },
  });
}

export function useCart() {
  return useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const res = await fetch('/api/cart');
      if (!res.ok) return null;
      return asJson<CartDto>(res);
    },
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { branchId: string; productId: string; quantity: number }) => {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.status === 401 || res.status === 403) throw new AuthRequiredError();
      return asJson<CartDto>(res);
    },
    onSuccess: (cart) => qc.setQueryData(['cart'], cart),
  });
}

export function useSetCartItemQuantity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { branchId: string; productId: string; quantity: number }) => {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.status === 401 || res.status === 403) throw new AuthRequiredError();
      return asJson<CartDto>(res);
    },
    onSuccess: (cart) => {
      qc.setQueryData(['cart'], cart);
      void qc.invalidateQueries({ queryKey: ['checkout-quote'] });
    },
  });
}

export function useRemoveFromCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch(`/api/cart/items/${productId}`, { method: 'DELETE' });
      return asJson<CartDto>(res);
    },
    onSuccess: (cart) => qc.setQueryData(['cart'], cart),
  });
}

export function useReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}/reorder`, { method: 'POST' });
      return asJson<ReorderResultDto>(res);
    },
    onSuccess: (result) => qc.setQueryData(['cart'], result.cart),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
    },
    onSuccess: () => qc.clear(),
  });
}
