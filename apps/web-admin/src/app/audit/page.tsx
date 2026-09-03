'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { AuditLogDto, Paginated } from '@lanyard/contracts';
import { formatDateTime, timeAgo } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  TableCard,
  Td,
  Th,
  cn,
  type Tone,
} from '@/components/ui';
import { IconAudit, IconChevronRight, IconShield } from '@/components/icons';
import { BranchFilter, useOperationalBranchFilter } from '@/components/branch-filter';

/** Action-prefix quick filters. */
const ACTION_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All activity' },
  { key: 'rx.', label: 'Prescriptions' },
  { key: 'phi.', label: 'PHI access' },
  { key: 'order.', label: 'Orders' },
  { key: 'inventory.', label: 'Inventory' },
  { key: 'payment.', label: 'Payments' },
  { key: 'refund.', label: 'Refunds' },
  { key: 'auth.', label: 'Auth' },
];

const ACTOR_TYPES = [
  { key: '', label: 'All actors' },
  { key: 'staff', label: 'Staff' },
  { key: 'customer', label: 'Customer' },
  { key: 'system', label: 'System' },
];

/** Colour an action by its domain prefix; PHI access is flagged red. */
function actionTone(action: string): Tone {
  if (action.startsWith('phi.')) return 'danger';
  if (action.startsWith('rx.')) return 'info';
  if (action.startsWith('refund.')) return 'warn';
  if (action.startsWith('payment.')) return 'success';
  if (action.startsWith('order.')) return 'info';
  if (action.startsWith('inventory.')) return 'success';
  if (action.startsWith('auth.') || action.startsWith('login')) return 'neutral';
  return 'neutral';
}

const ACTOR_TONE: Record<string, Tone> = {
  staff: 'info',
  customer: 'neutral',
  system: 'warn',
};

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { branchId, setBranchId, branches, canViewAllBranches, isLoading: branchesLoading } =
    useOperationalBranchFilter();

  const query = useInfiniteQuery({
    queryKey: ['audit', action, actorType, branchId, fromDate, toDate],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('cursor', pageParam);
      if (action) params.set('action', action);
      if (actorType) params.set('actorType', actorType);
      if (branchId) params.set('branchId', branchId);
      if (fromDate) params.set('from', `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set('to', `${toDate}T23:59:59.999Z`);
      const r = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!r.ok) throw new Error('Failed to load audit log');
      return (await r.json()) as Paginated<AuditLogDto>;
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Immutable, append-only record of every sensitive action — PCN & NDPA compliance backbone"
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
            <IconShield width={14} height={14} /> Tamper-evident
          </span>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setAction(f.key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              action === f.key
                ? 'bg-brand-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {f.label}
          </button>
        ))}
        <select
          value={actorType}
          onChange={(e) => setActorType(e.target.value)}
          className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500"
        >
          {ACTOR_TYPES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          From
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          To
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-500"
          />
        </label>
        {!branchesLoading ? (
          <BranchFilter
            branchId={branchId}
            onChange={setBranchId}
            branches={branches}
            canViewAllBranches={canViewAllBranches}
          />
        ) : null}
      </div>

      {query.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : query.isError ? (
        <Card>
          <EmptyState
            title="Couldn’t load the audit log"
            description="You may not have permission, or the service is unavailable."
            icon={IconAudit}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No matching activity"
            description="Nothing has been recorded for this filter yet."
            icon={IconAudit}
          />
        </Card>
      ) : (
        <>
          <TableCard>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Actor</Th>
                <Th>Target</Th>
                <Th right>{''}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => {
                const isOpen = expanded === e.id;
                return (
                  <AuditRow
                    key={e.id}
                    entry={e}
                    open={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : e.id)}
                  />
                );
              })}
            </tbody>
          </TableCard>

          <div className="mt-4 flex justify-center">
            {query.hasNextPage ? (
              <Button
                variant="secondary"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : (
              <span className="text-xs text-slate-400">
                {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · end of log
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AuditRow({
  entry,
  open,
  onToggle,
}: {
  entry: AuditLogDto;
  open: boolean;
  onToggle: () => void;
}) {
  // Prefer the human-readable summary; raw target ids stay in the expanded detail.
  const target =
    entry.summary ??
    (entry.targetType
      ? `${entry.targetType}${entry.targetId ? ` · ${entry.targetId.slice(-6)}` : ''}`
      : '—');

  return (
    <>
      <tr className="cursor-pointer transition-colors hover:bg-slate-50/60" onClick={onToggle}>
        <Td className="whitespace-nowrap">
          <div className="font-medium text-slate-700">{formatDateTime(entry.at)}</div>
          <div className="text-xs text-slate-400">{timeAgo(entry.at)}</div>
        </Td>
        <Td>
          <span className="font-mono text-xs font-medium text-slate-700">{entry.action}</span>
          <span className="ml-2 align-middle">
            <Badge tone={actionTone(entry.action)}>{entry.action.split('.')[0]}</Badge>
          </span>
        </Td>
        <Td>
          <Badge tone={ACTOR_TONE[entry.actorType] ?? 'neutral'}>{entry.actorType}</Badge>
          {entry.actorId && (
            <span className="ml-2 font-mono text-xs text-slate-400">
              …{entry.actorId.slice(-6)}
            </span>
          )}
        </Td>
        <Td className={entry.summary ? 'text-slate-700' : 'text-slate-500'}>{target}</Td>
        <Td right>
          <IconChevronRight
            width={16}
            height={16}
            className={cn('inline text-slate-300 transition-transform', open && 'rotate-90')}
          />
        </Td>
      </tr>
      {open && (
        <tr className="bg-slate-50/40">
          <td colSpan={5} className="px-5 py-4">
            <AuditDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

function AuditDetail({ entry }: { entry: AuditLogDto }) {
  const facts: { label: string; value?: string }[] = [
    { label: 'Action', value: entry.action },
    { label: 'Actor type', value: entry.actorType },
    { label: 'Actor ID', value: entry.actorId },
    { label: 'Target', value: entry.targetType },
    { label: 'Target ID', value: entry.targetId },
    { label: 'Branch ID', value: entry.branchId },
    { label: 'IP', value: entry.ip },
    { label: 'Trace ID', value: entry.traceId },
  ].filter((f) => f.value);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Entry details
        </h3>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
          {facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-slate-400">{f.label}</dt>
              <dd className="break-all font-mono text-xs text-slate-700">{f.value}</dd>
            </div>
          ))}
        </dl>
        {entry.userAgent && (
          <p className="mt-2 break-all text-xs text-slate-400">{entry.userAgent}</p>
        )}
      </div>
      <div className="space-y-3">
        {entry.metadata && <MetadataBlock data={entry.metadata} />}
        {entry.before && <JsonBlock title="Before" data={entry.before} />}
        {entry.after && <JsonBlock title="After" data={entry.after} />}
        {!entry.metadata && !entry.before && !entry.after && (
          <p className="text-xs text-slate-400">No additional payload recorded.</p>
        )}
      </div>
    </div>
  );
}

/** Turn a camelCase metadata key into a readable label ("invoiceNo" → "Invoice no"). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Render metadata as readable facts. Scalar values become label/value rows; an array
 * of objects (e.g. invoice line items) becomes a bulleted list. Raw JSON stays
 * available in a collapsible fallback for anything complex.
 */
function MetadataBlock({ data }: { data: Record<string, unknown> }) {
  const scalars = Object.entries(data).filter(
    ([, value]) =>
      value != null && (typeof value !== 'object' || value instanceof Date) && value !== '',
  );
  const lineArrays = Object.entries(data).filter(
    ([, value]) =>
      Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null),
  );

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Details</h3>
      {scalars.length > 0 ? (
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-sm">
          {scalars.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-slate-400">{humanizeKey(key)}</dt>
              <dd className="break-words text-slate-700">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {lineArrays.map(([key, value]) => (
        <div key={key} className="mt-2">
          <div className="text-xs font-semibold text-slate-500">{humanizeKey(key)}</div>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {(value as Array<Record<string, unknown>>).map((item, index) => (
              <li key={index} className="rounded-lg bg-white px-3 py-1.5 shadow-sm">
                {Object.entries(item)
                  .filter(([, v]) => v != null && v !== '')
                  .map(([k, v]) =>
                    k === 'product' || k === 'name' ? String(v) : `${humanizeKey(k)}: ${String(v)}`,
                  )
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          Raw metadata
        </summary>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
