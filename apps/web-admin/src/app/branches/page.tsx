'use client';

import { FormEvent, useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BranchStatus,
  CreateBranchSchema,
  type Paginated,
  UpdateBranchSchema,
} from '@lanyard/contracts';

import { IconAlert, IconBranch, IconCheck, IconOrders } from '@/components/icons';
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

type BranchRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country?: string;
    lat?: number;
    lng?: number;
    geo?: { coordinates?: [number, number] };
  };
  contact?: { phone?: string; email?: string };
  license?: { pcnPremisesNo?: string; superintendentStaffId?: string };
  fulfillment?: { pickup?: boolean; delivery?: boolean };
};

type BranchFormState = {
  id?: string;
  code: string;
  name: string;
  status: BranchStatus;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  lat: string;
  lng: string;
  phone: string;
  email: string;
  pcnPremisesNo: string;
  superintendentStaffId: string;
  pickup: boolean;
  delivery: boolean;
};

type FormMessage = { tone: 'success' | 'danger'; text: string };

type StaffLookupResult = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  pcnLicenseNo?: string;
  isSuperintendent: boolean;
};

const EMPTY_BRANCH_FORM: BranchFormState = {
  code: '',
  name: '',
  status: BranchStatus.INACTIVE,
  line1: '',
  line2: '',
  city: '',
  state: '',
  country: 'NG',
  lat: '',
  lng: '',
  phone: '',
  email: '',
  pcnPremisesNo: '',
  superintendentStaffId: '',
  pickup: true,
  delivery: false,
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function branchStatusTone(status?: string): 'success' | 'warn' | 'neutral' {
  if (status === BranchStatus.ACTIVE) return 'success';
  if (status === BranchStatus.INACTIVE) return 'neutral';
  return 'warn';
}

function humanizeToken(value?: string): string {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

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

function toBranchForm(branch: BranchRow): BranchFormState {
  const coordinates = branch.address.geo?.coordinates;
  const lng = coordinates?.[0] ?? branch.address.lng ?? 0;
  const lat = coordinates?.[1] ?? branch.address.lat ?? 0;

  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    status: (branch.status as BranchStatus | undefined) ?? BranchStatus.INACTIVE,
    line1: branch.address.line1,
    line2: branch.address.line2 ?? '',
    city: branch.address.city,
    state: branch.address.state,
    country: branch.address.country ?? 'NG',
    lat: String(lat),
    lng: String(lng),
    phone: branch.contact?.phone ?? '',
    email: branch.contact?.email ?? '',
    pcnPremisesNo: branch.license?.pcnPremisesNo ?? '',
    superintendentStaffId: branch.license?.superintendentStaffId ?? '',
    pickup: branch.fulfillment?.pickup ?? true,
    delivery: branch.fulfillment?.delivery ?? false,
  };
}

export default function BranchesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BranchFormState>(EMPTY_BRANCH_FORM);
  const [message, setMessage] = useState<FormMessage>();
  const [superintendentQuery, setSuperintendentQuery] = useState('');
  const deferredSuperintendentQuery = useDeferredValue(superintendentQuery);

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchRow>;
    },
  });

  const rows = branchesQ.data?.data ?? [];
  const selectedBranch = useMemo(
    () => rows.find((row) => row.id === form.id),
    [form.id, rows],
  );
  const activeCount = rows.filter((row) => row.status === BranchStatus.ACTIVE).length;
  const deliveryCount = rows.filter((row) => row.fulfillment?.delivery).length;
  const shouldLookupSuperintendent =
    deferredSuperintendentQuery.trim().length >= 2 ||
    /^[a-f\d]{24}$/i.test(deferredSuperintendentQuery.trim());

  const staffLookupQ = useQuery({
    queryKey: ['admin-staff-lookup', deferredSuperintendentQuery],
    enabled: shouldLookupSuperintendent,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/staff/lookup?q=${encodeURIComponent(deferredSuperintendentQuery.trim())}`,
      );
      if (!res.ok) throw new Error('Failed to lookup pharmacists');
      return (await res.json()) as { data: StaffLookupResult[] };
    },
  });

  const staffOptions = staffLookupQ.data?.data ?? [];
  const selectedSuperintendent = staffOptions.find((staff) => staff.id === form.superintendentStaffId);

  const branchMutation = useMutation({
    mutationFn: async (payload: { mode: 'create' | 'update'; body: unknown; id?: string }) => {
      const res = await fetch(
        payload.mode === 'create' ? '/api/admin/branches' : `/api/admin/branches/${payload.id}`,
        {
          method: payload.mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload.body),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Branch save failed');
      return body;
    },
    onSuccess: async (_body, variables) => {
      setMessage({
        tone: 'success',
        text: variables.mode === 'create' ? 'Branch created.' : 'Branch updated.',
      });
      if (variables.mode === 'create') {
        setForm(EMPTY_BRANCH_FORM);
        setSuperintendentQuery('');
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-branches', 'list'] });
    },
    onError: (error) => {
      setMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Branch save failed',
      });
    },
  });

  async function submitBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    const basePayload = {
      name: form.name,
      status: form.status,
      address: {
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        state: form.state,
        country: form.country || 'NG',
        lat: Number(form.lat),
        lng: Number(form.lng),
      },
      contact: form.phone || form.email ? { phone: form.phone || undefined, email: form.email || undefined } : undefined,
      pcnPremisesNo: form.pcnPremisesNo || undefined,
      superintendentStaffId: form.superintendentStaffId || undefined,
      fulfillment: {
        pickup: form.pickup,
        delivery: form.delivery,
        deliveryZones: [],
      },
    };

    const parsed = form.id
      ? UpdateBranchSchema.safeParse(basePayload)
      : CreateBranchSchema.safeParse({
          code: form.code,
          ...basePayload,
          pcnPremisesNo: form.pcnPremisesNo,
          superintendentStaffId: form.superintendentStaffId,
        });

    if (!parsed.success) {
      setMessage({
        tone: 'danger',
        text: parsed.error.issues[0]?.message ?? 'Check the branch form.',
      });
      return;
    }

    await branchMutation.mutateAsync({
      mode: form.id ? 'update' : 'create',
      body: parsed.data,
      id: form.id,
    });
  }

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Create locations, manage service status, and keep licensing data current"
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setForm(EMPTY_BRANCH_FORM);
              setSuperintendentQuery('');
              setMessage(undefined);
            }}
          >
            New branch
          </Button>
        }
      />

      {branchesQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : branchesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load branches"
            description="The branch admin endpoints are present, but the console could not reach them."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Registered branches" value={rows.length} icon={IconBranch} tone="brand" />
            <StatCard label="Active branches" value={activeCount} icon={IconCheck} tone="sky" />
            <StatCard label="Delivery enabled" value={deliveryCount} icon={IconOrders} tone="amber" />
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-[1.25fr_1.75fr]">
            <Panel
              title={form.id ? 'Update branch' : 'Create branch'}
              subtitle="Search pharmacists by name, email, phone, or PCN license before saving the branch"
            >
              <form className="space-y-4" onSubmit={submitBranch}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="branch-code">
                      Branch code
                    </label>
                    <input
                      id="branch-code"
                      value={form.code}
                      disabled={Boolean(form.id)}
                      onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                      className={inputClass}
                    />
                    {form.id ? <p className="mt-1 text-xs text-slate-500">Code is immutable after creation.</p> : null}
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-name">
                      Name
                    </label>
                    <input
                      id="branch-name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className={labelClass} htmlFor="branch-status">
                      Status
                    </label>
                    <select
                      id="branch-status"
                      value={form.status}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, status: event.target.value as BranchStatus }))
                      }
                      className={inputClass}
                    >
                      {Object.values(BranchStatus).map((value) => (
                        <option key={value} value={value}>
                          {humanizeToken(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-pcn">
                      PCN premises no.
                    </label>
                    <input
                      id="branch-pcn"
                      value={form.pcnPremisesNo}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, pcnPremisesNo: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="branch-superintendent">
                      Superintendent pharmacist
                    </label>
                    <input
                      id="branch-superintendent"
                      value={superintendentQuery}
                      onChange={(event) => {
                        setSuperintendentQuery(event.target.value);
                        setForm((current) => ({ ...current, superintendentStaffId: '' }));
                      }}
                      className={inputClass}
                      placeholder="Search by name, email, phone, or PCN license"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      The selected pharmacist id is saved automatically once you choose a result.
                    </p>

                    {form.superintendentStaffId ? (
                      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        <div className="font-semibold">
                          {(selectedSuperintendent?.fullName ?? superintendentQuery) ||
                            form.superintendentStaffId}
                        </div>
                        <div className="mt-0.5 text-xs text-emerald-700/90">
                          {selectedSuperintendent?.email ?? form.superintendentStaffId}
                          {selectedSuperintendent?.pcnLicenseNo
                            ? ` · PCN ${selectedSuperintendent.pcnLicenseNo}`
                            : ''}
                          {selectedSuperintendent?.isSuperintendent ? ' · Current superintendent' : ''}
                        </div>
                      </div>
                    ) : null}

                    {superintendentQuery.trim().length > 0 ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white shadow-sm">
                        {staffLookupQ.isLoading ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                            <Spinner /> Searching pharmacists...
                          </div>
                        ) : staffLookupQ.isError ? (
                          <div className="px-3 py-2 text-sm text-rose-600">
                            Could not load pharmacist suggestions.
                          </div>
                        ) : !shouldLookupSuperintendent ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            Type at least 2 characters to search.
                          </div>
                        ) : staffOptions.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">No matching pharmacists found.</div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {staffOptions.map((staff) => (
                              <button
                                key={staff.id}
                                type="button"
                                className={cn(
                                  'w-full px-3 py-2 text-left transition-colors hover:bg-slate-50',
                                  form.superintendentStaffId === staff.id && 'bg-brand-50',
                                )}
                                onClick={() => {
                                  setForm((current) => ({
                                    ...current,
                                    superintendentStaffId: staff.id,
                                  }));
                                  setSuperintendentQuery(staff.fullName);
                                }}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-medium text-slate-900">{staff.fullName}</div>
                                    <div className="text-xs text-slate-500">
                                      {staff.email}
                                      {staff.phone ? ` · ${staff.phone}` : ''}
                                      {staff.pcnLicenseNo ? ` · PCN ${staff.pcnLicenseNo}` : ''}
                                    </div>
                                  </div>
                                  {staff.isSuperintendent ? (
                                    <Badge tone="info">Superintendent</Badge>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="branch-line1">
                      Address line 1
                    </label>
                    <input
                      id="branch-line1"
                      value={form.line1}
                      onChange={(event) => setForm((current) => ({ ...current, line1: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-line2">
                      Address line 2
                    </label>
                    <input
                      id="branch-line2"
                      value={form.line2}
                      onChange={(event) => setForm((current) => ({ ...current, line2: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <label className={labelClass} htmlFor="branch-city">
                      City
                    </label>
                    <input
                      id="branch-city"
                      value={form.city}
                      onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-state">
                      State
                    </label>
                    <input
                      id="branch-state"
                      value={form.state}
                      onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-country">
                      Country
                    </label>
                    <input
                      id="branch-country"
                      value={form.country}
                      onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-lat">
                      Latitude
                    </label>
                    <input
                      id="branch-lat"
                      type="number"
                      step="0.000001"
                      value={form.lat}
                      onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-lng">
                      Longitude
                    </label>
                    <input
                      id="branch-lng"
                      type="number"
                      step="0.000001"
                      value={form.lng}
                      onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="branch-phone">
                      Contact phone
                    </label>
                    <input
                      id="branch-phone"
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="branch-email">
                      Contact email
                    </label>
                    <input
                      id="branch-email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.pickup}
                      onChange={(event) => setForm((current) => ({ ...current, pickup: event.target.checked }))}
                    />
                    Pickup enabled
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.delivery}
                      onChange={(event) => setForm((current) => ({ ...current, delivery: event.target.checked }))}
                    />
                    Delivery enabled
                  </label>
                </div>

                {selectedBranch ? (
                  <p className="text-xs text-slate-500">
                    Editing {selectedBranch.name}. Select “New branch” to create another location.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Branch creation now searches active pharmacists instead of requiring manual staff ids.
                  </p>
                )}

                <InlineNotice message={message} />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={branchMutation.isPending}>
                    {branchMutation.isPending ? (
                      <>
                        <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Saving...
                      </>
                    ) : form.id ? (
                      'Update branch'
                    ) : (
                      'Create branch'
                    )}
                  </Button>
                  {form.id ? (
                    <Button type="button" variant="secondary" onClick={() => setForm(EMPTY_BRANCH_FORM)}>
                      Clear selection
                    </Button>
                  ) : null}
                </div>
              </form>
            </Panel>

            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  title="No branches found"
                  description="Use the branch form to create the first location for inventory, pricing, and fulfilment."
                  icon={IconBranch}
                />
              </Card>
            ) : (
              <TableCard>
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <Th>Branch</Th>
                    <Th>Status</Th>
                    <Th>Location</Th>
                    <Th>Services</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const active = form.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-slate-50/60',
                          active && 'bg-brand-50/60',
                        )}
                        onClick={() => {
                          setForm(toBranchForm(row));
                          setSuperintendentQuery(row.license?.superintendentStaffId ?? '');
                          setMessage(undefined);
                        }}
                      >
                        <Td>
                          <div className="font-semibold text-slate-900">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.code}</div>
                        </Td>
                        <Td>
                          <Badge tone={branchStatusTone(row.status)}>{humanizeToken(row.status)}</Badge>
                        </Td>
                        <Td>
                          <div className="text-slate-700">{row.address.line1}</div>
                          <div className="text-xs text-slate-500">
                            {row.address.city}, {row.address.state}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={row.fulfillment?.pickup ? 'info' : 'neutral'}>
                              {row.fulfillment?.pickup ? 'Pickup' : 'No pickup'}
                            </Badge>
                            <Badge tone={row.fulfillment?.delivery ? 'success' : 'neutral'}>
                              {row.fulfillment?.delivery ? 'Delivery' : 'No delivery'}
                            </Badge>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
