'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paginated, VendorDto } from '@lanyard/contracts';

import { cn } from '@/components/ui';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

/**
 * Vendor typeahead for the invoice form — searches the vendor registry and, when the
 * typed name isn't already a vendor, offers to add it inline (so receiving is never
 * blocked). Selecting or adding sets both `id` (registry link) and `name` (snapshot).
 */
export function VendorPicker({
  value,
  onChange,
  invalid,
}: {
  value: { id?: string; name: string };
  onChange: (vendor: { id?: string; name: string }) => void;
  invalid?: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(value.name);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reflect external resets / draft loads.
  useEffect(() => {
    setText(value.name);
  }, [value.name]);

  const vendorsQ = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vendors?limit=100');
      if (!res.ok) throw new Error('Failed to load vendors');
      return (await res.json()) as Paginated<VendorDto>;
    },
  });
  const vendors = useMemo(() => vendorsQ.data?.data ?? [], [vendorsQ.data]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const active = vendors.filter((v) => v.isActive);
    return (q ? active.filter((v) => v.name.toLowerCase().includes(q)) : active).slice(0, 20);
  }, [vendors, text]);

  const exactExists = useMemo(
    () => vendors.some((v) => v.name.trim().toLowerCase() === text.trim().toLowerCase()),
    [vendors, text],
  );

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to add vendor');
      return json.data as VendorDto;
    },
    onSuccess: async (vendor) => {
      onChange({ id: vendor.id, name: vendor.name });
      setText(vendor.name);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
    },
  });

  return (
    <div ref={containerRef} className="relative">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // Typing a free name clears any registry link until a pick/add.
          onChange({ name: e.target.value });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search or add a vendor…"
        className={cn(inputClass, invalid && 'border-rose-400')}
      />
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: v.id, name: v.name });
                  setText(v.name);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {v.name}
              </button>
            </li>
          ))}
          {text.trim() && !exactExists ? (
            <li>
              <button
                type="button"
                disabled={addMutation.isPending}
                onClick={() => addMutation.mutate(text.trim())}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
              >
                {addMutation.isPending ? 'Adding…' : `+ Add “${text.trim()}” as a new vendor`}
              </button>
            </li>
          ) : null}
          {matches.length === 0 && (!text.trim() || exactExists) ? (
            <li className="px-3 py-2 text-sm text-slate-500">
              No vendors yet — type a name to add one
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
