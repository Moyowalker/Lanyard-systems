import type { ReactNode, SVGProps } from 'react';
import { IconArrowUp, IconArrowDown } from './icons';

/** Tiny classnames joiner (no dep). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ───────────────────────── Surfaces ───────────────────────── */

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}) {
  return (
    <As
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white shadow-card-raised',
        className,
      )}
    >
      {children}
    </As>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card as="section" className={cn('overflow-hidden', className)}>
      {(title || action) && (
        <div className="panel-grad-header flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

/* ───────────────────────── Page header ───────────────────────── */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───────────────────────── Stat card ───────────────────────── */

export function StatCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  icon?: (p: SVGProps<SVGSVGElement>) => ReactNode;
  tone?: 'brand' | 'amber' | 'rose' | 'sky' | 'slate';
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <Card className="group min-w-0 overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-card-hover">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-slate-500">{label}</span>
        {Icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.03] transition-transform duration-200 group-hover:scale-105',
              tones[tone],
            )}
          >
            <Icon width={18} height={18} />
          </span>
        )}
      </div>
      <div className="mt-3 min-w-0 overflow-hidden text-ellipsis text-3xl font-bold tracking-tight text-slate-900 [font-variant-numeric:tabular-nums]">
        {value}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-semibold',
              delta.direction === 'up' && 'text-emerald-600',
              delta.direction === 'down' && 'text-rose-600',
              delta.direction === 'flat' && 'text-slate-400',
            )}
          >
            {delta.direction === 'up' && <IconArrowUp width={12} height={12} />}
            {delta.direction === 'down' && <IconArrowDown width={12} height={12} />}
            {delta.value}
          </span>
        )}
        {hint && <span className="min-w-0 break-words text-xs text-slate-400">{hint}</span>}
      </div>
    </Card>
  );
}

/* ───────────────────────── Badge ───────────────────────── */

export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warn: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  danger: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ───────────────────────── Buttons ───────────────────────── */

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BTN: Record<BtnVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700 hover:shadow-card-hover active:translate-y-px',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
  danger: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: {
  variant?: BtnVariant;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none',
        BTN[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── Table ───────────────────────── */

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </Card>
  );
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500',
        right ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={cn('px-5 py-3 text-slate-700', right && 'text-right', className)}>{children}</td>
  );
}

/* ───────────────────────── States ───────────────────────── */

export function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: (p: SVGProps<SVGSVGElement>) => ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon width={24} height={24} />
        </span>
      )}
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600',
        className,
      )}
    />
  );
}
