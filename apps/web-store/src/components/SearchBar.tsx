'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SearchBar() {
  const [q, setQ] = useState('');
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="group flex flex-1 items-center rounded-xl border border-paper-200 bg-paper-50 px-4 py-2.5 transition focus-within:border-brand-400 focus-within:bg-white focus-within:shadow-card"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 flex-none text-ink-700/40 transition group-focus-within:text-brand-700"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search medicines, wellness products, or brands"
        className="w-full bg-transparent px-3 text-sm text-ink-900 placeholder:text-ink-700/45 focus:outline-none"
      />
      <button
        type="submit"
        className="hidden rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800 sm:inline-flex"
      >
        Search
      </button>
    </form>
  );
}
