import { RoleKey } from '@lanyard/contracts';
import type { IconKey } from '@/components/icons';

/** Business personas the console is designed around. */
export type Persona = 'owner' | 'manager' | 'pharmacist' | 'support';

export function personaFor(roles: string[]): Persona {
  if (roles.includes(RoleKey.ADMIN) || roles.includes(RoleKey.SUPER_ADMIN)) return 'owner';
  if (roles.includes(RoleKey.BRANCH_MANAGER)) return 'manager';
  if (roles.includes(RoleKey.PHARMACIST)) return 'pharmacist';
  return 'support';
}

export const PERSONA_LABEL: Record<Persona, string> = {
  owner: 'Owner · Administrator',
  manager: 'Branch Manager',
  pharmacist: 'Pharmacist',
  support: 'Support',
};

export const PERSONA_FOCUS: Record<Persona, string> = {
  owner: 'Business performance, compliance & finance',
  manager: 'Branch operations & fulfilment',
  pharmacist: 'Prescription verification & dispensing',
  support: 'Customer orders & assistance',
};

export type NavItem = {
  label: string;
  href: string;
  icon: IconKey;
  /** Roles allowed to see this item; empty = all staff. */
  roles?: RoleKey[];
  /** Render but disable (roadmap item, no backend yet). */
  soon?: boolean;
};

export type NavSection = { heading: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: 'dashboard' }],
  },
  {
    heading: 'Pharmacy',
    items: [
      {
        label: 'Prescriptions',
        href: '/prescriptions',
        icon: 'rx',
        roles: [RoleKey.PHARMACIST, RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Orders', href: '/orders', icon: 'orders' },
      {
        label: 'Deliveries',
        href: '/deliveries',
        icon: 'orders',
        roles: [RoleKey.BRANCH_MANAGER, RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
      {
        label: 'Inventory',
        href: '/inventory',
        icon: 'inventory',
        roles: [RoleKey.BRANCH_MANAGER, RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
    ],
  },
  {
    heading: 'Catalog',
    items: [
      {
        label: 'Products',
        href: '/products',
        icon: 'catalog',
        roles: [RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
      {
        label: 'Pricing',
        href: '/pricing',
        icon: 'pricing',
        roles: [RoleKey.BRANCH_MANAGER, RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
      {
        label: 'Branches',
        href: '/branches',
        icon: 'branch',
        roles: [RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
    ],
  },
  {
    heading: 'Finance',
    items: [
      {
        label: 'Payments & Refunds',
        href: '/finance',
        icon: 'finance',
        roles: [RoleKey.BRANCH_MANAGER, RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
      {
        label: 'Reports',
        href: '/reports',
        icon: 'reports',
        roles: [RoleKey.BRANCH_MANAGER, RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
    ],
  },
  {
    heading: 'Administration',
    items: [
      {
        label: 'Leads',
        href: '/leads',
        icon: 'bell',
        roles: [RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
      {
        label: 'Audit Log',
        href: '/audit',
        icon: 'audit',
        roles: [RoleKey.ADMIN, RoleKey.SUPER_ADMIN],
      },
      {
        label: 'Staff & Access',
        href: '/staff',
        icon: 'staff',
        roles: [RoleKey.SUPER_ADMIN],
        soon: true,
      },
    ],
  },
];

function canSee(item: NavItem, roles: string[]): boolean {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.some((r) => roles.includes(r));
}

/** Sections with items the given roles may see (empty sections dropped). */
export function visibleNav(roles: string[]): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i, roles)) })).filter(
    (s) => s.items.length > 0,
  );
}

export function initialsOf(firstName?: string, lastName?: string): string {
  const a = firstName?.[0] ?? '';
  const b = lastName?.[0] ?? '';
  return (a + b || 'LN').toUpperCase();
}
