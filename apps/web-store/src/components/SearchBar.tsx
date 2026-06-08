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
      className="flex flex-1 items-center"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search medicines…"
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
      />
    </form>
  );
}
