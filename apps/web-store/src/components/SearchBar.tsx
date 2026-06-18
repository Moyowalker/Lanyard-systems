'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ProductListItemDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';

export function SearchBar() {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<ProductListItemDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced typeahead lookup. Aborts in-flight requests as the user keeps typing.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/suggest?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: ProductListItemDto[] };
        setSuggestions(body.data ?? []);
        setOpen((body.data ?? []).length > 0);
        setActive(-1);
      } catch {
        /* aborted or offline — ignore */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function submit(term: string) {
    const value = term.trim();
    if (!value) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  function goToProduct(p: ProductListItemDto) {
    setOpen(false);
    setQ('');
    router.push(`/products/${p.slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      goToProduct(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        role="search"
        aria-label="Search for medicines"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="field-shell flex w-full items-center gap-2 rounded-full px-2 py-1.5 pl-4"
      >
        <label htmlFor="store-search" className="sr-only">
          Search medicines, dosage, or brand
        </label>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 flex-none text-ink-900/40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          id="store-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          placeholder="Search medicines, e.g. Paracetamol"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-900/40 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Search"
          className="inline-flex flex-none items-center justify-center rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {open ? (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-paper-200 bg-white py-1 shadow-lift"
        >
          {suggestions.map((p, i) => {
            const meta = [p.form, p.strength, p.packSize].filter(Boolean).join(' · ');
            return (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => goToProduct(p)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                    i === active ? 'bg-brand-50' : 'hover:bg-paper-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">{p.name}</span>
                    {meta ? (
                      <span className="block truncate text-xs text-ink-900/55">{meta}</span>
                    ) : null}
                  </span>
                  {p.price?.priceKobo != null ? (
                    <span className="tnum flex-none text-xs font-semibold text-ink-900">
                      {formatKobo(p.price.priceKobo)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
