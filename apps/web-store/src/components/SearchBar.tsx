'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SearchBar() {
  const [q, setQ] = useState('');
  const router = useRouter();

  return (
    <form
      role="search"
      aria-label="Search for medicines"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
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
  );
}
