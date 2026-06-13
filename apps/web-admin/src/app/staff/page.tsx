'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RoleDto, RolesAndPermissionsDto, StaffDto } from '@lanyard/contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  TableCard,
  Td,
  Th,
  cn,
} from '@/components/ui';
import { IconCheck, IconStaff } from '@/components/icons';

type Branch = { id: string; name: string; code?: string };

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function StaffPage() {
  const [editing, setEditing] = useState<StaffDto | null | 'new'>(null);

  const staffQ = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const r = await fetch('/api/admin/staff');
      return r.ok ? ((await r.json()) as { data: StaffDto[] }) : null;
    },
  });
  const rolesQ = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const r = await fetch('/api/admin/roles');
      return r.ok ? ((await r.json()) as RolesAndPermissionsDto) : null;
    },
  });
  const branchesQ = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: async () => {
      const r = await fetch('/api/admin/branches?limit=100');
      return r.ok ? ((await r.json()) as { data: Branch[] }) : null;
    },
  });

  const staff = staffQ.data?.data ?? [];
  const roles = rolesQ.data?.roles ?? [];
  const branches = branchesQ.data?.data ?? [];
  const branchName = (id: string) =>
    id === 'ALL' ? 'All branches' : (branches.find((b) => b.id === id)?.name ?? id.slice(-6));

  return (
    <div>
      <PageHeader
        title="Staff & access"
        subtitle="Manage staff accounts, roles, and branch scope"
        actions={
          <Button onClick={() => setEditing('new')} disabled={roles.length === 0}>
            + Add staff
          </Button>
        }
      />

      {editing && (
        <div className="mb-6">
          <StaffForm
            initial={editing === 'new' ? null : editing}
            roles={roles}
            branches={branches}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              staffQ.refetch();
            }}
          />
        </div>
      )}

      {staffQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : staff.length === 0 ? (
        <Card>
          <EmptyState title="No staff accounts yet" description="Add your first staff member." icon={IconStaff} />
        </Card>
      ) : (
        <TableCard>
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <Th>Name</Th>
              <Th>Roles</Th>
              <Th>Branch scope</Th>
              <Th>Status</Th>
              <Th>MFA</Th>
              <Th right>{''}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-slate-50/60">
                <Td>
                  <div className="font-medium text-slate-900">
                    {s.firstName} {s.lastName}
                  </div>
                  <div className="text-xs text-slate-400">{s.email}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {s.roles.map((r) => (
                      <Badge key={r.id} tone="info">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-slate-500">
                  {s.branchScope.map(branchName).join(', ') || '—'}
                </Td>
                <Td>
                  <Badge tone={s.status === 'active' ? 'success' : 'danger'}>{s.status}</Badge>
                </Td>
                <Td>
                  {s.mfaEnabled ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <IconCheck width={14} height={14} /> On
                    </span>
                  ) : (
                    <span className="text-amber-600">Off</span>
                  )}
                </Td>
                <Td right>
                  <Button variant="secondary" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}

function StaffForm({
  initial,
  roles,
  branches,
  onClose,
  onSaved,
}: {
  initial: StaffDto | null;
  roles: RoleDto[];
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(initial);
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [roleIds, setRoleIds] = useState<string[]>(initial?.roles.map((r) => r.id) ?? []);
  const [allBranches, setAllBranches] = useState(initial?.branchScope.includes('ALL') ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(
    (initial?.branchScope ?? []).filter((b) => b !== 'ALL'),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function submit() {
    setError(undefined);
    const scope = allBranches ? ['ALL'] : branchIds;
    if (roleIds.length === 0) return setError('Assign at least one role.');
    if (scope.length === 0) return setError('Assign at least one branch (or All branches).');
    if (!editing && password.length < 12) return setError('Password must be at least 12 characters.');

    setBusy(true);
    const body: Record<string, unknown> = {
      firstName,
      lastName,
      phone: phone.trim() || undefined,
      roleIds,
      branchScope: scope,
    };
    if (editing) body.status = status;
    else {
      body.email = email;
      body.password = password;
    }

    const url = editing ? `/api/admin/staff/${initial!.id}` : '/api/admin/staff';
    const r = await fetch(url, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(data?.error?.message ?? 'Could not save staff.');
    onSaved();
  }

  async function resetPassword() {
    const pwd = window.prompt('New password (min 12 characters):');
    if (!pwd) return;
    if (pwd.length < 12) return setError('Password must be at least 12 characters.');
    setBusy(true);
    const r = await fetch(`/api/admin/staff/${initial!.id}/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    setBusy(false);
    if (!r.ok) {
      const data = await r.json().catch(() => null);
      return setError(data?.error?.message ?? 'Could not reset password.');
    }
    setError(undefined);
    window.alert('Password updated.');
  }

  return (
    <Panel
      title={editing ? `Edit ${initial!.firstName} ${initial!.lastName}` : 'Add staff'}
      action={
        <button onClick={onClose} className="text-sm font-medium text-slate-400 hover:text-slate-700">
          Cancel
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>First name</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
        </div>
        {!editing && (
          <div>
            <label className={labelClass}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass}>Phone (optional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" className={inputClass} />
        </div>
        {!editing && (
          <div>
            <label className={labelClass}>Initial password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="min 12 characters"
              className={inputClass}
            />
          </div>
        )}
        {editing && (
          <div>
            <label className={labelClass}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputClass}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className={labelClass}>Roles</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => toggle(roleIds, setRoleIds, role.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition',
                roleIds.includes(role.id)
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {role.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className={labelClass}>Branch scope</div>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
          All branches (cross-branch access)
        </label>
        {!allBranches && (
          <div className="mt-2 flex flex-wrap gap-2">
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(branchIds, setBranchIds, b.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition',
                  branchIds.includes(b.id)
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {b.name}
              </button>
            ))}
            {branches.length === 0 && <span className="text-sm text-slate-400">No branches found.</span>}
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create staff'}
        </Button>
        {editing && (
          <Button variant="secondary" onClick={resetPassword} disabled={busy}>
            Reset password
          </Button>
        )}
      </div>
    </Panel>
  );
}
