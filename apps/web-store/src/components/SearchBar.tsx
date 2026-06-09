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
      className="field-shell group flex min-h-[3.4rem] w-full items-center gap-3 px-3 py-2.5"
    >
      <label htmlFor="store-search" className="sr-only">
        Search medicines, dosage, or brand
      </label>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-focus-within:bg-brand-100 group-focus-within:text-brand-800">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        id="store-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search medicines, dosage, wellness products, or brands"
        className="w-full min-w-0 bg-transparent text-sm text-ink-900 placeholder:text-ink-700/45 focus:outline-none"
      />
      <span className="hidden text-[0.68rem] font-medium text-ink-700/52 xl:inline-flex">
        Fast search across medicine name, strength, and brand
      </span>
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-xl bg-ink-950 px-3.5 py-2 text-xs font-semibold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-brand-800"
      >
        Search
      </button>
    </form>
  );
}
