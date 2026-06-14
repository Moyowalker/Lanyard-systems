'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PermissionDto, RoleDto, RolesAndPermissionsDto } from '@lanyard/contracts';
import { Badge, Button, Card, PageHeader, Panel, Skeleton, cn } from '@/components/ui';
import { IconShield } from '@/components/icons';

const SUPER_ADMIN_KEY = 'SUPER_ADMIN';

export default function RolesPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['roles', 'manage'],
    queryFn: async () => {
      const r = await fetch('/api/admin/roles');
      return r.ok ? ((await r.json()) as RolesAndPermissionsDto) : null;
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const roles = data?.roles ?? [];
  const permissions = data?.permissions ?? [];
  const selected = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader title="Roles & permissions" subtitle="Define what each role can do" />

      {isLoading ? (
        <Card className="p-5">
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <div className="space-y-2">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedId(role.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                  selectedId === role.id
                    ? 'border-brand-300 bg-brand-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{role.name}</div>
                  <div className="text-xs text-slate-400">
                    {role.permissionKeys.length} permissions
                  </div>
                </div>
                {role.isSystem && <Badge tone="neutral">System</Badge>}
              </button>
            ))}
          </div>

          {selected ? (
            <RoleEditor
              key={selected.id}
              role={selected}
              permissions={permissions}
              onSaved={() => refetch()}
            />
          ) : (
            <Card className="flex items-center justify-center p-10 text-sm text-slate-400">
              Select a role to view and edit its permissions.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function RoleEditor({
  role,
  permissions,
  onSaved,
}: {
  role: RoleDto;
  permissions: PermissionDto[];
  onSaved: () => void;
}) {
  const readOnly = role.key === SUPER_ADMIN_KEY;
  const [keys, setKeys] = useState<string[]>(role.permissionKeys);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | undefined>();

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of permissions) {
      const g = p.group ?? 'other';
      map.set(g, [...(map.get(g) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  function toggle(key: string) {
    if (readOnly) return;
    setKeys((k) => (k.includes(key) ? k.filter((x) => x !== key) : [...k, key]));
  }

  async function save() {
    setBusy(true);
    setMsg(undefined);
    const r = await fetch(`/api/admin/roles/${role.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permissionKeys: keys }),
    });
    const data = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: data?.error?.message ?? 'Could not save role.' });
    setMsg({ ok: true, text: 'Role permissions saved.' });
    onSaved();
  }

  return (
    <Panel
      title={`${role.name} · ${role.key}`}
      subtitle={
        readOnly ? 'The Super Admin role is protected and always has full access' : role.description
      }
      action={
        readOnly ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
            <IconShield width={14} height={14} /> Protected
          </span>
        ) : (
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        )
      }
    >
      {readOnly ? (
        <p className="text-sm text-slate-500">
          Super Admin always holds every permission and cannot be edited — this keeps a guaranteed
          recovery path into the console.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map(([group, perms]) => (
            <div key={group}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {perms.map((p) => (
                  <label
                    key={p.key}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition',
                      keys.includes(p.key)
                        ? 'border-brand-200 bg-brand-50/50'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={keys.includes(p.key)}
                      onChange={() => toggle(p.key)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-slate-800">{p.key}</span>
                      {p.restricted && <Badge tone="warn">restricted</Badge>}
                      <span className="block text-xs text-slate-400">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <p className={cn('mt-4 text-sm', msg.ok ? 'text-emerald-600' : 'text-rose-600')}>
          {msg.text}
        </p>
      )}
    </Panel>
  );
}
