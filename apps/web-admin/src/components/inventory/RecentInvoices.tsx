'use client';

import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paginated, StockInvoiceDto } from '@lanyard/contracts';

import { Badge, Button, Skeleton, cn } from '@/components/ui';
import { formatKobo } from '@/lib/format';

type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

function paymentBadge(invoice: StockInvoiceDto): { tone: Tone; label: string } {
  if (invoice.paymentStatus === 'paid') return { tone: 'success', label: 'Paid' };
  const due = invoice.paymentDueDate ? invoice.paymentDueDate.slice(0, 10) : null;
  const overdue = invoice.paymentDueDate ? new Date(invoice.paymentDueDate) < new Date() : false;
  if (overdue) return { tone: 'danger', label: due ? `Overdue · ${due}` : 'Overdue' };
  return { tone: 'warn', label: due ? `Unpaid · due ${due}` : 'Unpaid' };
}

const chipClass = (active: boolean) =>
  cn(
    'rounded-full px-3 py-1 text-xs font-semibold transition',
    active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  );

/**
 * Recent goods-received invoices with Received | Drafts filter chips. Draft rows offer
 * Resume (loads back into the form), Publish, and Delete; received rows show payment
 * status and a Mark paid action. Self-contained query keyed by branch + filter.
 */
function RecentInvoicesInner({
  branchId,
  onResume,
  onChanged,
}: {
  branchId: string;
  onResume: (invoice: StockInvoiceDto) => void;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<'received' | 'draft'>('received');
  const [busyId, setBusyId] = useState<string | null>(null);

  const invoicesQ = useQuery({
    queryKey: ['admin-invoices', branchId, filter],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/invoices?limit=10&status=${filter}`,
      );
      if (!res.ok) throw new Error('Failed to load invoices');
      return (await res.json()) as Paginated<StockInvoiceDto>;
    },
  });

  const invoices = invoicesQ.data?.data ?? [];

  async function act(url: string, method: string, id: string) {
    setBusyId(id);
    try {
      const res = await fetch(url, {
        method,
        headers: method === 'PATCH' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'PATCH' ? JSON.stringify({ paymentStatus: 'paid' }) : undefined,
      });
      if (!res.ok) return;
      await invoicesQ.refetch();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  const base = `/api/admin/branches/${branchId}/inventory/invoices`;

  async function uploadScan(id: string, file: File) {
    setBusyId(id);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${base}/${id}/attachment`, { method: 'POST', body });
      if (!res.ok) return;
      await invoicesQ.refetch();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function viewScan(id: string) {
    const res = await fetch(`${base}/${id}/attachment/url`);
    if (!res.ok) return;
    const body = (await res.json()) as { url?: string };
    if (body.url) window.open(body.url, '_blank', 'noopener');
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className={chipClass(filter === 'received')}
          onClick={() => setFilter('received')}
        >
          Received
        </button>
        <button
          type="button"
          className={chipClass(filter === 'draft')}
          onClick={() => setFilter('draft')}
        >
          Drafts
        </button>
      </div>

      {invoicesQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-slate-500">
          {filter === 'draft'
            ? 'No draft invoices — start one above and “Save as draft”.'
            : 'No invoices received yet — use the form above to record the first delivery.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((invoice) => {
            const pay = paymentBadge(invoice);
            const isDraft = invoice.status === 'draft';
            return (
              <li key={invoice.id}>
                <details className="rounded-xl border border-slate-200 bg-white">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-800">
                        {invoice.invoiceNo}
                      </span>
                      <span className="text-sm text-slate-600">{invoice.vendorName}</span>
                      {isDraft ? (
                        <Badge tone="warn">Draft</Badge>
                      ) : (
                        <Badge tone={pay.tone}>{pay.label}</Badge>
                      )}
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

                    <div className="mt-3 flex flex-wrap gap-2">
                      {isDraft ? (
                        <>
                          <Button variant="secondary" onClick={() => onResume(invoice)}>
                            Resume
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busyId === invoice.id}
                            onClick={() => act(`${base}/${invoice.id}/publish`, 'POST', invoice.id)}
                          >
                            Publish
                          </Button>
                          <button
                            type="button"
                            disabled={busyId === invoice.id}
                            onClick={() => act(`${base}/${invoice.id}`, 'DELETE', invoice.id)}
                            className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      ) : invoice.paymentStatus === 'unpaid' ? (
                        <Button
                          variant="secondary"
                          disabled={busyId === invoice.id}
                          onClick={() => act(`${base}/${invoice.id}/payment`, 'PATCH', invoice.id)}
                        >
                          Mark paid
                        </Button>
                      ) : null}

                      {/* Scanned invoice attachment (audit) — available on any invoice. */}
                      {invoice.hasAttachment ? (
                        <button
                          type="button"
                          onClick={() => viewScan(invoice.id)}
                          className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
                        >
                          View scan
                        </button>
                      ) : null}
                      <label className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                        {busyId === invoice.id
                          ? 'Uploading…'
                          : invoice.hasAttachment
                            ? 'Replace scan'
                            : 'Attach scan'}
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          className="hidden"
                          disabled={busyId === invoice.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadScan(invoice.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const RecentInvoices = memo(RecentInvoicesInner);
