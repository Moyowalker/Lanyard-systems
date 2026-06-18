'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { PrescriptionDto } from '@lanyard/contracts';
import { rxTone } from '@/lib/format';
import { Badge, Button, Panel, Spinner } from '@/components/ui';
import { IconAlert, IconChevronRight, IconExternal, IconShield } from '@/components/icons';

export default function PrescriptionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [note, setNote] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const {
    data: rx,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['rx', id],
    queryFn: async () => {
      const r = await fetch(`/api/admin/prescriptions/${id}`);
      return r.ok ? ((await r.json()) as PrescriptionDto) : null;
    },
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Spinner /> Loading prescription…
      </div>
    );
  if (!rx) return <p className="text-slate-600">Prescription not found.</p>;

  const allClean = rx.files.every((f) => f.avScan === 'clean');
  const decided = rx.status !== 'pending' && rx.status !== 'under_review';

  async function viewFile(fileId: string) {
    const r = await fetch(`/api/admin/prescriptions/${id}/files/${fileId}/url`);
    if (!r.ok) return setError('Could not load file');
    const { url } = await r.json();
    window.open(url, '_blank', 'noopener');
  }

  async function decide(decision: 'verified' | 'rejected') {
    if (decision === 'rejected' && !note.trim()) {
      return setError('Add a reason before declining this prescription.');
    }
    setBusy(true);
    setError(undefined);
    const r = await fetch(`/api/admin/prescriptions/${id}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, note: note || undefined }),
    });
    const body = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(body?.error?.message ?? 'Action failed');
    await refetch();
    router.push('/prescriptions');
  }

  async function requestInfo() {
    if (!requestNote.trim()) return setError('Add a short note for the customer.');
    setBusy(true);
    setError(undefined);
    const r = await fetch(`/api/admin/prescriptions/${id}/request-info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: requestNote }),
    });
    const body = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(body?.error?.message ?? 'Action failed');
    await refetch();
    router.push('/prescriptions');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/prescriptions"
        className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <IconChevronRight width={14} height={14} className="rotate-180" /> Back to queue
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Prescription {rx.id.slice(-6)}
        </h1>
        <Badge tone={rxTone(rx.status)}>{rx.status}</Badge>
      </div>

      <Panel
        title="Files"
        subtitle="Protected health information — access is logged"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
            <IconShield width={14} height={14} /> PHI · audited
          </span>
        }
      >
        <ul className="space-y-2">
          {rx.files.map((f) => (
            <li
              key={f.fileId}
              className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-sm"
            >
              <span className="text-slate-600">
                {f.mime} ·{' '}
                <Badge tone={f.avScan === 'clean' ? 'success' : 'warn'}>scan: {f.avScan}</Badge>
              </span>
              <Button variant="secondary" onClick={() => viewFile(f.fileId)}>
                <IconExternal width={15} height={15} /> View
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      {decided ? (
        <Panel title="Decision">
          <p className="text-sm text-slate-600">
            This prescription is <strong className="text-slate-900">{rx.status}</strong>.
          </p>
          {rx.verification?.note ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {rx.verification.decision === 'rejected' ? 'Decline reason' : 'Note'}:{' '}
              {rx.verification.note}
            </p>
          ) : null}
          {rx.clarificationRequest ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              More information requested: {rx.clarificationRequest.note}
            </p>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Verification decision">
          {!allClean && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <IconAlert width={18} height={18} className="mt-0.5 shrink-0" />
              All files must pass the antivirus scan before this prescription can be verified.
            </p>
          )}
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Note{' '}
            <span className="font-normal normal-case text-slate-400">
              (optional to approve · required to decline)
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason shown to the customer when declining, or an optional approval note"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            rows={2}
          />
          <div className="flex gap-3">
            <Button onClick={() => decide('verified')} disabled={busy || !allClean}>
              Verify & approve
            </Button>
            <Button variant="danger" onClick={() => decide('rejected')} disabled={busy}>
              Reject
            </Button>
          </div>
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-amber-800"
              htmlFor="request-info"
            >
              Request more information
            </label>
            <textarea
              id="request-info"
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              placeholder="Tell the customer what to re-upload or clarify"
              className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
              rows={2}
            />
            <Button className="mt-2" variant="secondary" onClick={requestInfo} disabled={busy}>
              Request info
            </Button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </Panel>
      )}
    </div>
  );
}
