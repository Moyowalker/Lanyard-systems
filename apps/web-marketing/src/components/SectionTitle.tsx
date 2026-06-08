import type { ReactNode } from 'react';

export function SectionTitle({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  copy: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="mt-3 font-display text-3xl leading-tight text-ink-900 sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 text-base leading-7 text-ink-700/80">{copy}</p>
      </div>
      {action}
    </div>
  );
}
