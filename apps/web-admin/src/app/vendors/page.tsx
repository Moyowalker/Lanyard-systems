'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateVendorSchema, Paginated, UpdateVendorSchema, VendorDto } from '@lanyard/contracts';

import { IconAlert, IconInventory } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  Spinner,
  TableCard,
  Td,
  Th,
} from '@/components/ui';

type VendorForm = {
  id?: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  isActive: boolean;
};

const EMPTY: VendorForm = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  note: '',
  isActive: true,
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<VendorForm>(EMPTY);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const vendorsQ = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vendors?limit=100');
      if (!res.ok) throw new Error('Failed to load vendors');
      return (await res.json()) as Paginated<VendorDto>;
    },
  });

  const vendors = useMemo(() => vendorsQ.data?.data ?? [], [vendorsQ.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter((v) =>
      [v.name, v.contactName, v.phone, v.email]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(term)),
    );
  }, [vendors, search]);

  const saveMutation = useMutation({
    mutationFn: async (payload: VendorForm) => {
      const body = {
        name: payload.name,
        contactName: payload.contactName || (payload.id ? null : undefined),
        phone: payload.phone || (payload.id ? null : undefined),
        email: payload.email || (payload.id ? null : undefined),
        address: payload.address || (payload.id ? null : undefined),
        note: payload.note || (payload.id ? null : undefined),
        isActive: payload.isActive,
      };
      const schema = payload.id ? UpdateVendorSchema : CreateVendorSchema;
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Check the vendor details.');
      }
      const url = payload.id ? `/api/admin/vendors/${payload.id}` : '/api/admin/vendors';
      const res = await fetch(url, {
        method: payload.id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to save vendor');
      return json as { data: VendorDto };
    },
    onSuccess: async (json) => {
      setMessage({ tone: 'success', text: `Vendor "${json.data.name}" saved.` });
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
    },
    onError: (err) =>
      setMessage({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Failed to save vendor',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/vendors/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? 'Failed to remove vendor');
      }
    },
    onSuccess: async () => {
      setMessage({ tone: 'success', text: 'Vendor removed.' });
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
    },
    onError: (err) =>
      setMessage({
        tone: 'danger',
        text: err instanceof Error ? err.message : 'Failed to remove vendor',
      }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    saveMutation.mutate(form);
  }

  function removeVendor() {
    if (!form.id) return;
    if (!window.confirm(`Remove ${form.name}? Existing invoice history will be kept.`)) return;
    setMessage(null);
    deleteMutation.mutate(form.id);
  }

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you receive stock from — used when recording invoices"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="mb-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors by name, contact, phone, or email"
              aria-label="Search vendors"
              className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
            />
          </div>

          {vendorsQ.isLoading ? (
            <Card className="p-5">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </Card>
          ) : vendorsQ.isError ? (
            <Card>
              <EmptyState
                title="Could not load vendors"
                description="The vendors endpoint did not return data. Check your permissions or connection."
                icon={IconAlert}
              />
            </Card>
          ) : vendors.length === 0 ? (
            <Card>
              <EmptyState
                title="No vendors yet"
                description="Add your first supplier using the form on the right."
                icon={IconInventory}
              />
            </Card>
          ) : (
            <TableCard>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Vendor</Th>
                  <Th>Contact</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/60"
                    onClick={() =>
                      setForm({
                        id: v.id,
                        name: v.name,
                        contactName: v.contactName ?? '',
                        phone: v.phone ?? '',
                        email: v.email ?? '',
                        address: v.address ?? '',
                        note: v.note ?? '',
                        isActive: v.isActive,
                      })
                    }
                  >
                    <Td>
                      <div className="font-semibold text-slate-900">{v.name}</div>
                      {v.email ? <div className="text-xs text-slate-500">{v.email}</div> : null}
                    </Td>
                    <Td>{v.contactName ?? '—'}</Td>
                    <Td>{v.phone ?? '—'}</Td>
                    <Td>
                      <Badge tone={v.isActive ? 'success' : 'neutral'}>
                        {v.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </div>

        <Panel
          title={form.id ? 'Edit vendor' : 'Add vendor'}
          subtitle={form.id ? 'Update this supplier' : 'Create a new supplier'}
          action={
            form.id ? (
              <Button variant="secondary" onClick={() => setForm(EMPTY)}>
                New
              </Button>
            ) : undefined
          }
        >
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <label className={labelClass} htmlFor="vendor-name">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="vendor-name"
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Emzor Distribution"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="vendor-contact">
                Contact person
              </label>
              <input
                id="vendor-contact"
                value={form.contactName}
                onChange={(e) => setForm((c) => ({ ...c, contactName: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="vendor-phone">
                Phone
              </label>
              <input
                id="vendor-phone"
                value={form.phone}
                onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                className={inputClass}
                placeholder="+2348012345678"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="vendor-email">
                Email
              </label>
              <input
                id="vendor-email"
                value={form.email}
                onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="vendor-address">
                Address
              </label>
              <input
                id="vendor-address"
                value={form.address}
                onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="vendor-note">
                Note
              </label>
              <input
                id="vendor-note"
                value={form.note}
                onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))}
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((c) => ({ ...c, isActive: e.target.checked }))}
              />
              Active supplier
            </label>

            {message ? (
              <p
                className={
                  message.tone === 'success'
                    ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
                    : 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'
                }
              >
                {message.text}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={saveMutation.isPending || deleteMutation.isPending || !form.name.trim()}
            >
              {saveMutation.isPending ? (
                <>
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Saving…
                </>
              ) : form.id ? (
                'Update vendor'
              ) : (
                'Add vendor'
              )}
            </Button>
            {form.id ? (
              <button
                type="button"
                onClick={removeVendor}
                disabled={saveMutation.isPending || deleteMutation.isPending}
                className="ml-2 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Removing…' : 'Remove vendor'}
              </button>
            ) : null}
          </form>
        </Panel>
      </div>
    </div>
  );
}
