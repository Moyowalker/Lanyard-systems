'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@lanyard/contracts';
import { Icons } from './icons';
import { IconBell, IconClose, IconLogout, IconMenu, IconShield } from './icons';
import { cn } from './ui';
import { visibleNav, personaFor, PERSONA_LABEL, initialsOf, type NavItem } from '@/lib/roles';

function useMe(enabled = true) {
  return useQuery({
    queryKey: ['me'],
    enabled,
    queryFn: async () => {
      const r = await fetch('/api/me');
      return r.ok ? ((await r.json()) as MeResponse) : null;
    },
  });
}

function NavLink({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect?: () => void;
}) {
  const Icon = Icons[item.icon];
  if (item.soon) {
    return (
      <span className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/35">
        <Icon width={18} height={18} />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
          Soon
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
        active
          ? 'bg-white/10 text-white shadow-sm'
          : 'text-white/60 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />
      )}
      <Icon
        width={18}
        height={18}
        className={cn(
          'transition-colors',
          active ? 'text-brand-300' : 'group-hover:text-brand-200',
        )}
      />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/login';
  const isChangePasswordRoute = pathname === '/account/change-password';
  const { data: me } = useMe(!isLoginRoute);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Rotation policy: force the change-password screen until the password is renewed.
  const mustChangePassword = Boolean(me?.mustChangePassword);
  useEffect(() => {
    if (mustChangePassword && !isChangePasswordRoute && !isLoginRoute) {
      router.replace('/account/change-password');
    }
  }, [mustChangePassword, isChangePasswordRoute, isLoginRoute, router]);

  // Login and the forced change-password screen are full-bleed — no shell chrome.
  if (isLoginRoute || isChangePasswordRoute) return <>{children}</>;

  const roles = me?.roles ?? [];
  const persona = personaFor(roles);
  const sections = visibleNav(roles);
  const branch = me?.branchScope?.[0];
  const branchLabel = !branch || branch === 'ALL' ? 'All branches' : branch;

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-gradient-to-b from-ink-800 via-ink-900 to-ink-950 shadow-sidebar lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-900/40">
            <IconShield width={20} height={20} />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white">Lanyard</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-brand-300">
              Pharmacy Console
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
          {sections.map((section) => (
            <div key={section.heading}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {section.heading}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User card */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-200">
              {initialsOf(me?.profile.firstName, me?.profile.lastName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                {me?.profile.firstName ?? 'Staff'} {me?.profile.lastName ?? ''}
              </div>
              <div className="truncate text-[11px] text-white/45">{PERSONA_LABEL[persona]}</div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconLogout width={18} height={18} />
            </button>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <aside
            className="flex h-full w-72 flex-col bg-ink-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
                  <IconShield width={20} height={20} />
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-bold text-white">Lanyard</div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-brand-300">
                    Pharmacy Console
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                title="Close navigation"
              >
                <IconClose width={18} height={18} />
              </button>
            </div>

            <div className="border-y border-white/10 px-5 py-3 text-xs text-white/55">
              <div className="font-medium text-white/80">{PERSONA_LABEL[persona]}</div>
              <div className="mt-1">{branchLabel}</div>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
              {sections.map((section) => (
                <div key={section.heading}>
                  <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    {section.heading}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        onSelect={() => setMobileNavOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-white/10 p-3">
              <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-200">
                  {initialsOf(me?.profile.firstName, me?.profile.lastName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">
                    {me?.profile.firstName ?? 'Staff'} {me?.profile.lastName ?? ''}
                  </div>
                  <div className="truncate text-[11px] text-white/45">{PERSONA_LABEL[persona]}</div>
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <IconLogout width={18} height={18} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/70 px-5 backdrop-blur-xl lg:px-8">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            title="Open navigation"
          >
            <IconMenu width={20} height={20} />
          </button>
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <IconShield width={18} height={18} />
            </span>
            <span className="font-bold text-slate-900">Lanyard</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 sm:inline-flex">
              <Icons.branch width={14} height={14} />
              {branchLabel}
            </span>
            <span className="hidden text-xs text-slate-400 md:inline">
              {new Date().toLocaleDateString('en-NG', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <button className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
              <IconBell width={20} height={20} />
            </button>
            <button
              onClick={signOut}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 lg:hidden"
              title="Sign out"
            >
              <IconLogout width={20} height={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
