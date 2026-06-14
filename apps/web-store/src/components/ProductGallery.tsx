'use client';

import { useState } from 'react';
import { RxBadge } from './RxBadge';

function Placeholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'L';
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper-50">
      <span className="select-none text-7xl font-semibold text-brand-200">{initial}</span>
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="absolute h-16 w-16 text-brand-400/70"
        fill="none"
      >
        <rect
          x="9"
          y="18"
          width="30"
          height="12"
          rx="6"
          transform="rotate(-30 24 24)"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path d="M19.5 13 28.5 28.6" stroke="currentColor" strokeWidth="2.2" />
      </svg>
    </div>
  );
}

export function ProductGallery({
  images,
  name,
  rx,
}: {
  images: string[];
  name: string;
  rx?: boolean;
}) {
  const [active, setActive] = useState(0);
  const hasImages = images.length > 0;
  const current = hasImages ? images[Math.min(active, images.length - 1)] : null;

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-paper-200 bg-white">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Placeholder name={name} />
        )}
        {rx ? (
          <div className="absolute left-3 top-3">
            <RxBadge />
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-2.5">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1} of ${images.length}`}
              aria-pressed={i === active}
              className={`h-16 w-16 flex-none overflow-hidden rounded-xl border bg-white transition ${
                i === active ? 'border-brand-500 ring-2 ring-brand-200' : 'border-paper-200 hover:border-brand-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
