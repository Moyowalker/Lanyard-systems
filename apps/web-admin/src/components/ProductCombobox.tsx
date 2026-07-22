'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/components/ui';

export type ComboboxProduct = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
  sku?: string;
  barcode?: string;
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function detailLine(p: ComboboxProduct): string {
  return [p.genericName, p.brand, p.form, p.strength].filter(Boolean).join(' · ');
}

/**
 * Typeahead product picker — replaces the unusable 100-option `<select>`s. Client-side
 * filters the loaded catalog by name/generic/brand/SKU/barcode (max 20 shown). Enter
 * selects an exact SKU/barcode match first (so a scanned barcode + Enter resolves the
 * exact product), otherwise the highlighted row. Modeled on the branches-page staff
 * lookup pattern.
 */
export function ProductCombobox({
  products,
  value,
  onChange,
  placeholder = 'Search product by name, SKU, or barcode…',
  id,
  disabled,
  invalid,
}: {
  products: ComboboxProduct[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => products.find((p) => p.id === value), [products, value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? products.filter((p) =>
          [p.name, p.genericName, p.brand, p.sku, p.barcode]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q)),
        )
      : products;
    return pool.slice(0, 20);
  }, [products, query]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function select(product: ComboboxProduct) {
    onChange(product.id);
    setQuery('');
    setOpen(false);
    setEditing(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const q = query.trim();
      if (q) {
        const exact =
          products.find((p) => p.barcode && p.barcode.trim() === q) ??
          products.find((p) => p.sku && p.sku.toUpperCase() === q.toUpperCase());
        if (exact) {
          select(exact);
          return;
        }
      }
      if (matches[highlight]) select(matches[highlight]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setEditing(false);
    }
  }

  // Selected + not actively editing: show a compact summary chip with a Change button.
  if (selected && !editing) {
    return (
      <div ref={containerRef} className="min-w-0">
        <div
          className={cn(
            'flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2',
            invalid ? 'border-rose-400' : 'border-slate-300',
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-800">
              {selected.name}
            </span>
            {detailLine(selected) ? (
              <span className="block truncate text-xs text-slate-500">{detailLine(selected)}</span>
            ) : null}
          </span>
          {!disabled ? (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setOpen(true);
                setHighlight(0);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
            >
              Change
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
        className={cn(inputClass, invalid && 'border-rose-400')}
      />
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matching products</li>
          ) : (
            matches.map((product, index) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(product)}
                  className={cn(
                    'flex w-full flex-col items-start px-3 py-2 text-left',
                    index === highlight ? 'bg-brand-50' : 'hover:bg-slate-50',
                  )}
                >
                  <span className="text-sm font-medium text-slate-800">{product.name}</span>
                  {detailLine(product) ? (
                    <span className="text-xs text-slate-500">{detailLine(product)}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
