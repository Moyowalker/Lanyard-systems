'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ReceiveInvoiceSchema, StockInvoiceDto } from '@lanyard/contracts';

import { Button, Spinner, cn } from '@/components/ui';
import { ProductCombobox, type ComboboxProduct } from '@/components/ProductCombobox';
import { VendorPicker } from '@/components/inventory/VendorPicker';
import type { PriceRow } from '@/components/use-branch-prices';

/** One line of the goods-received (invoice) form. Money fields are naira strings. */
type InvoiceLineForm = {
  productId: string;
  quantity: string;
  batchNo: string;
  expiry: string;
  reorderLevel: string;
  costNaira: string;
  priceNaira: string;
  /** Binary — no "leave unchanged". Defaults to visible for new lines. */
  visibility: 'visible' | 'hidden';
};

type InvoiceFormState = {
  idempotencyKey: string;
  vendorId?: string;
  vendorName: string;
  invoiceNo: string;
  invoiceDate: string;
  note: string;
  paymentStatus: 'paid' | 'unpaid';
  paymentDueDate: string;
  lines: InvoiceLineForm[];
};

const emptyLine = (): InvoiceLineForm => ({
  productId: '',
  quantity: '',
  batchNo: '',
  expiry: '',
  reorderLevel: '',
  costNaira: '',
  priceNaira: '',
  visibility: 'visible',
});

const emptyForm = (): InvoiceFormState => ({
  idempotencyKey: crypto.randomUUID(),
  vendorId: undefined,
  vendorName: '',
  invoiceNo: '',
  invoiceDate: '',
  note: '',
  paymentStatus: 'unpaid',
  paymentDueDate: '',
  lines: [emptyLine()],
});

/** Rebuild the editable form from a stored draft invoice (Resume). */
function formFromInvoice(invoice: StockInvoiceDto): InvoiceFormState {
  return {
    idempotencyKey: invoice.idempotencyKey ?? crypto.randomUUID(),
    vendorId: invoice.vendorId,
    vendorName: invoice.vendorName,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate.slice(0, 10),
    note: invoice.note ?? '',
    paymentStatus: invoice.paymentStatus,
    paymentDueDate: invoice.paymentDueDate ? invoice.paymentDueDate.slice(0, 10) : '',
    lines: invoice.lines.map((line) => ({
      productId: line.productId,
      quantity: String(line.quantity),
      batchNo: line.batchNo ?? '',
      expiry: line.expiry ? line.expiry.slice(0, 10) : '',
      reorderLevel: line.reorderLevel != null ? String(line.reorderLevel) : '',
      costNaira: line.costKobo != null ? String(line.costKobo / 100) : '',
      priceNaira: line.priceKobo != null ? String(line.priceKobo / 100) : '',
      visibility: line.visibleOnStorefront === false ? 'hidden' : 'visible',
    })),
  };
}

const LINE_FIELD_LABEL: Record<string, string> = {
  productId: 'Product',
  quantity: 'Quantity',
  batchNo: 'Batch number',
  expiry: 'Expiry',
  reorderLevel: 'Reorder level',
  costKobo: 'Cost',
  priceKobo: 'Selling price',
  visibleOnStorefront: 'Storefront visibility',
};

/** Turn a zod issue path into a human-readable field label (e.g. "Line 2 — Quantity"). */
function friendlyField(path: (string | number)[]): string {
  const [head, idx, sub] = path;
  if (head === 'vendorName') return 'Vendor';
  if (head === 'invoiceNo') return 'Invoice number';
  if (head === 'invoiceDate') return 'Invoice date';
  if (head === 'paymentStatus') return 'Payment status';
  if (head === 'paymentDueDate') return 'Expected payment date';
  if (head === 'lines' && typeof idx === 'number') {
    const subLabel = typeof sub === 'string' ? (LINE_FIELD_LABEL[sub] ?? sub) : '';
    return `Line ${idx + 1}${subLabel ? ` — ${subLabel}` : ''}`;
  }
  return typeof head === 'string' ? head : 'Form';
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

/**
 * Goods-received (invoice) form. Owns its own state so keystrokes re-render only the
 * form, not the whole inventory page. Supports saving as a draft, publishing (receiving),
 * resuming a draft, binary storefront visibility, per-line payment status, and
 * field-labeled validation errors.
 */
export function InvoiceReceiveForm({
  branchId,
  products,
  pricesById,
  editingInvoice,
  onSaved,
  onCancelEdit,
}: {
  branchId: string;
  products: ComboboxProduct[];
  pricesById: Map<string, PriceRow>;
  editingInvoice: StockInvoiceDto | null;
  onSaved: (message: string) => void;
  onCancelEdit: () => void;
}) {
  const [form, setForm] = useState<InvoiceFormState>(() =>
    editingInvoice ? formFromInvoice(editingInvoice) : emptyForm(),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<null | 'draft' | 'receive' | 'publish'>(null);

  // Reset the form when the invoice being edited changes (resume / new).
  const editId = editingInvoice?.id ?? null;
  const [lastEditId, setLastEditId] = useState<string | null>(editId);
  if (editId !== lastEditId) {
    setLastEditId(editId);
    setForm(editingInvoice ? formFromInvoice(editingInvoice) : emptyForm());
    setMessage(null);
    setFieldErrors(new Set());
  }

  const isRequired = useMemo(() => (key: string) => fieldErrors.has(key), [fieldErrors]);
  const invoiceSummary = useMemo(
    () =>
      form.lines.reduce(
        (summary, line) => {
          const quantity = Number(line.quantity) || 0;
          const costNaira = Number(line.costNaira) || 0;
          return {
            units: summary.units + quantity,
            totalCostNaira: summary.totalCostNaira + quantity * costNaira,
          };
        },
        { units: 0, totalCostNaira: 0 },
      ),
    [form.lines],
  );
  const belowCostLines = useMemo(
    () =>
      form.lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => {
          const cost = Number(line.costNaira);
          const price = Number(line.priceNaira);
          return Number.isFinite(cost) && Number.isFinite(price) && cost > 0 && price < cost;
        }),
    [form.lines],
  );

  function patchLine(index: number, patch: Partial<InvoiceLineForm>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  function buildPayload(asDraft: boolean) {
    const lines = form.lines.filter((line) => line.productId);
    return ReceiveInvoiceSchema.safeParse({
      vendorId: form.vendorId,
      vendorName: form.vendorName,
      invoiceNo: form.invoiceNo,
      invoiceDate: form.invoiceDate,
      note: form.note || undefined,
      paymentStatus: form.paymentStatus,
      idempotencyKey: form.idempotencyKey,
      paymentDueDate:
        form.paymentStatus === 'unpaid' ? form.paymentDueDate || undefined : undefined,
      asDraft,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        batchNo: line.batchNo || undefined,
        expiry: line.expiry || undefined,
        reorderLevel: line.reorderLevel || undefined,
        costKobo: line.costNaira ? Math.round(Number(line.costNaira) * 100) : undefined,
        priceKobo: line.priceNaira ? Math.round(Number(line.priceNaira) * 100) : undefined,
        visibleOnStorefront: line.visibility === 'visible',
      })),
    });
  }

  async function persist(mode: 'draft' | 'receive' | 'publish') {
    setMessage(null);
    setFieldErrors(new Set());

    if (form.lines.filter((line) => line.productId).length === 0) {
      setMessage('Add at least one product line.');
      return;
    }

    const parsed = buildPayload(mode === 'draft');
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFieldErrors(new Set(parsed.error.issues.map((i) => i.path.join('.'))));
      setMessage(issue ? `${friendlyField(issue.path)} — ${issue.message}` : 'Check the form.');
      return;
    }

    setPending(mode);
    try {
      const base = `/api/admin/branches/${branchId}/inventory/invoices`;
      if (editingInvoice) {
        await request(`${base}/${editingInvoice.id}`, 'PUT', parsed.data);
        if (mode === 'publish') {
          await request(`${base}/${editingInvoice.id}/publish`, 'POST');
        }
      } else {
        await request(base, 'POST', parsed.data);
      }
      const label =
        mode === 'draft'
          ? `Draft ${form.invoiceNo || 'invoice'} saved.`
          : `Invoice ${form.invoiceNo || ''} from ${form.vendorName} received.`;
      if (!editingInvoice) setForm(emptyForm());
      onSaved(label);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save the invoice.');
    } finally {
      setPending(null);
    }
  }

  async function request(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const parsed = await res.json().catch(() => null);
      const issues = parsed?.error?.details
        ?.map((d: { field?: string; issue?: string }) => `${d.field}: ${d.issue}`)
        .join('; ');
      throw new Error(issues || parsed?.error?.message || 'Request failed');
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(editingInvoice ? 'publish' : 'receive');
  }

  const busy = pending !== null;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {editingInvoice
              ? `Edit draft ${editingInvoice.invoiceNo}`
              : 'Receive stock — supplier invoice'}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            One entry per invoice: vendor, invoice number, supply date, and every product on it.
            This is the record the audit trail is built on.
          </p>
        </div>
        {editingInvoice ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Cancel edit
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>
            Vendor <span className="text-rose-500">*</span>
          </label>
          <div className="mt-1">
            <VendorPicker
              value={{ id: form.vendorId, name: form.vendorName }}
              onChange={(vendor) =>
                setForm((c) => ({ ...c, vendorId: vendor.id, vendorName: vendor.name }))
              }
              invalid={isRequired('vendorName')}
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="invoice-no">
            Invoice number <span className="text-rose-500">*</span>
          </label>
          <input
            id="invoice-no"
            value={form.invoiceNo}
            onChange={(e) => setForm((c) => ({ ...c, invoiceNo: e.target.value }))}
            className={cn(inputClass, isRequired('invoiceNo') && 'border-rose-400')}
            placeholder="e.g. INV-0231"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="invoice-date">
            Invoice date (supplied) <span className="text-rose-500">*</span>
          </label>
          <input
            id="invoice-date"
            type="date"
            value={form.invoiceDate}
            onChange={(e) => setForm((c) => ({ ...c, invoiceDate: e.target.value }))}
            className={cn(inputClass, isRequired('invoiceDate') && 'border-rose-400')}
          />
        </div>
      </div>

      <div className="space-y-3">
        {form.lines.map((line, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Product line {index + 1}
            </p>
            <div className="grid gap-2 sm:grid-cols-[2fr_0.8fr_1fr_1fr] sm:items-end">
              <div>
                <label className={labelClass}>Product</label>
                <div className="mt-1">
                  <ProductCombobox
                    products={products}
                    value={line.productId}
                    onChange={(productId) => {
                      const currentPrice = pricesById.get(productId);
                      patchLine(index, {
                        productId,
                        costNaira:
                          line.costNaira || currentPrice?.costKobo == null
                            ? line.costNaira
                            : String(currentPrice.costKobo / 100),
                        priceNaira:
                          line.priceNaira || currentPrice?.priceKobo == null
                            ? line.priceNaira
                            : String(currentPrice.priceKobo / 100),
                      });
                    }}
                    invalid={isRequired(`lines.${index}.productId`)}
                  />
                </div>
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
                  onChange={(e) => patchLine(index, { quantity: e.target.value })}
                  className={cn(
                    inputClass,
                    isRequired(`lines.${index}.quantity`) && 'border-rose-400',
                  )}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`line-batch-${index}`}>
                  Batch no
                </label>
                <input
                  id={`line-batch-${index}`}
                  value={line.batchNo}
                  onChange={(e) => patchLine(index, { batchNo: e.target.value })}
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
                  onChange={(e) => patchLine(index, { expiry: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.2fr_auto] sm:items-end">
              <div>
                <label className={labelClass} htmlFor={`line-cost-${index}`}>
                  Cost (₦)
                </label>
                <input
                  id={`line-cost-${index}`}
                  type="number"
                  min="0"
                  value={line.costNaira}
                  onChange={(e) => patchLine(index, { costNaira: e.target.value })}
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
                  onChange={(e) => patchLine(index, { priceNaira: e.target.value })}
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
                  onChange={(e) => patchLine(index, { reorderLevel: e.target.value })}
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
                  onChange={(e) =>
                    patchLine(index, {
                      visibility: e.target.value as InvoiceLineForm['visibility'],
                    })
                  }
                  className={inputClass}
                >
                  <option value="visible">Visible on storefront</option>
                  <option value="hidden">Hidden (POS only)</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    lines:
                      current.lines.length > 1
                        ? current.lines.filter((_, i) => i !== index)
                        : current.lines,
                  }))
                }
                disabled={form.lines.length === 1}
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
          onClick={() => setForm((c) => ({ ...c, lines: [...c.lines, emptyLine()] }))}
        >
          Add product line
        </Button>
      </div>

      {/* Payment status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={labelClass}>Payment</span>
          <div className="mt-1 flex gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment-status"
                checked={form.paymentStatus === 'unpaid'}
                onChange={() => setForm((c) => ({ ...c, paymentStatus: 'unpaid' }))}
              />
              Unpaid
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="payment-status"
                checked={form.paymentStatus === 'paid'}
                onChange={() => setForm((c) => ({ ...c, paymentStatus: 'paid' }))}
              />
              Paid
            </label>
          </div>
        </div>
        {form.paymentStatus === 'unpaid' ? (
          <div>
            <label className={labelClass} htmlFor="invoice-due">
              Expected payment date <span className="text-rose-500">*</span>
            </label>
            <input
              id="invoice-due"
              type="date"
              value={form.paymentDueDate}
              onChange={(e) => setForm((c) => ({ ...c, paymentDueDate: e.target.value }))}
              className={cn(inputClass, isRequired('paymentDueDate') && 'border-rose-400')}
            />
          </div>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="invoice-note">
          Note
        </label>
        <input
          id="invoice-note"
          value={form.note}
          onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))}
          className={inputClass}
          placeholder="Optional receiving note"
        />
      </div>

      <p className="text-xs text-slate-500">
        Setting a selling price and “Visible on storefront” publishes the product online the moment
        the invoice is received — no separate pricing step. Save as draft to finish it later.
      </p>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2">
        <div>
          <div className={labelClass}>Total units</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{invoiceSummary.units}</div>
        </div>
        <div>
          <div className={labelClass}>Invoice total cost</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {new Intl.NumberFormat('en-NG', {
              style: 'currency',
              currency: 'NGN',
              minimumFractionDigits: 2,
            }).format(invoiceSummary.totalCostNaira)}
          </div>
        </div>
      </div>

      {belowCostLines.length > 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Selling price is below cost on line{belowCostLines.length === 1 ? '' : 's'}{' '}
          {belowCostLines.map(({ index }) => index + 1).join(', ')}. Confirm this is intentional before
          receiving stock.
        </p>
      ) : null}

      {message ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !branchId}>
          {pending === 'receive' || pending === 'publish' ? (
            <>
              <Spinner className="h-4 w-4 border-white/40 border-t-white" />{' '}
              {editingInvoice ? 'Publishing…' : 'Receiving…'}
            </>
          ) : editingInvoice ? (
            'Publish invoice'
          ) : (
            'Receive invoice'
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !branchId}
          onClick={() => persist('draft')}
        >
          {pending === 'draft' ? (
            <>
              <Spinner className="h-4 w-4" /> Saving…
            </>
          ) : editingInvoice ? (
            'Update draft'
          ) : (
            'Save as draft'
          )}
        </Button>
      </div>
    </form>
  );
}
