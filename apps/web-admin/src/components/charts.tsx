import { cn } from './ui';

export type Segment = { label: string; value: number; color: string };

/** Dependency-free donut chart via SVG stroke-dasharray. */
export function Donut({
  segments,
  size = 160,
  thickness = 22,
  centerLabel,
  centerSub,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(241 245 249)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * c;
            const seg = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="space-y-2">
        {centerLabel && (
          <div className="mb-1">
            <div className="text-xl font-bold text-slate-900">{centerLabel}</div>
            {centerSub && <div className="text-xs text-slate-400">{centerSub}</div>}
          </div>
        )}
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="ml-auto font-semibold text-slate-900">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type Bar = { label: string; value: number; tone?: string };

/** Horizontal bar list — good for status / category breakdowns. */
export function Bars({ items, unit }: { items: Bar[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No data yet.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-600">{i.label}</span>
            <span className="font-semibold text-slate-900">
              {i.value}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', i.tone ?? 'bg-brand-500')}
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact sparkline-style weekly revenue columns. */
export function ColumnChart({
  data,
  format,
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center gap-1.5">
          <div className="relative flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-brand-500/85 transition-all group-hover:bg-brand-600"
              style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
            >
              <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {format ? format(d.value) : d.value}
              </div>
            </div>
          </div>
          <span className="text-[11px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
