'use client';

import { useQuery } from '@tanstack/react-query';
import type { Paginated } from '@lanyard/contracts';

import { IconAlert, IconCatalog, IconCheck, IconClock, IconRx } from '@/components/icons';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';

type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
  regulatoryClass?: string;
  requiresPrescription?: boolean;
  status?: string;
};

function humanizeToken(value?: string): string {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function productStatusTone(status?: string): 'success' | 'warn' | 'neutral' {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'DRAFT') return 'warn';
  return 'neutral';
}

export default function ProductsPage() {
  const productsQ = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const res = await fetch('/api/admin/catalog/products?limit=100');
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<AdminProductRow>;
    },
  });

  const rows = productsQ.data?.data ?? [];
  const publishedCount = rows.filter((row) => row.status === 'PUBLISHED').length;
  const draftCount = rows.filter((row) => row.status === 'DRAFT').length;
  const prescriptionCount = rows.filter((row) => row.requiresPrescription).length;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Global catalog entries available to pricing and branch inventory"
        actions={
          <span className="text-sm text-slate-400">
            {rows.length} SKU{rows.length === 1 ? '' : 's'}
          </span>
        }
      />

      {productsQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : productsQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load products"
            description="The admin catalog API is available, but the frontend had no page bound to it."
            icon={IconAlert}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No products in the catalog"
            description="Seed or create catalog products so branches can price and stock them."
            icon={IconCatalog}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Catalog SKUs" value={rows.length} icon={IconCatalog} tone="brand" />
            <StatCard label="Published" value={publishedCount} icon={IconCheck} tone="sky" />
            <StatCard label="Draft" value={draftCount} icon={IconClock} tone="amber" />
            <StatCard label="Prescription products" value={prescriptionCount} icon={IconRx} tone="rose" />
          </div>

          <TableCard>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Product</Th>
                <Th>Form</Th>
                <Th>Class</Th>
                <Th>Prescription</Th>
                <Th>Status</Th>
                <Th>Slug</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/60">
                  <Td>
                    <div className="font-semibold text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">
                      {[row.genericName, row.brand, row.strength].filter(Boolean).join(' · ') ||
                        'No secondary descriptors'}
                    </div>
                  </Td>
                  <Td>{humanizeToken(row.form)}</Td>
                  <Td>{humanizeToken(row.regulatoryClass)}</Td>
                  <Td>
                    <Badge tone={row.requiresPrescription ? 'warn' : 'info'}>
                      {row.requiresPrescription ? 'Required' : 'Not required'}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={productStatusTone(row.status)}>{humanizeToken(row.status)}</Badge>
                  </Td>
                  <Td className="text-slate-500">/{row.slug}</Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      )}
    </div>
  );
}