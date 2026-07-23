import { RoleKey } from '@lanyard/contracts';
import type { IconKey } from '@/components/icons';

/** Business personas the console is designed around. */
export type Persona = 'owner' | 'manager' | 'pharmacist' | 'inventory' | 'cashier' | 'support';

export function personaFor(roles: string[]): Persona {
  if (roles.includes(RoleKey.ADMIN) || roles.includes(RoleKey.SUPER_ADMIN)) return 'owner';
  if (roles.includes(RoleKey.BRANCH_MANAGER)) return 'manager';
  if (roles.includes(RoleKey.PHARMACIST)) return 'pharmacist';
  if (roles.includes(RoleKey.INVENTORY_OFFICER)) return 'inventory';
  if (roles.includes(RoleKey.CASHIER)) return 'cashier';
  return 'support';
}

export const PERSONA_LABEL: Record<Persona, string> = {
  owner: 'Owner · Administrator',
  manager: 'Branch Manager',
  pharmacist: 'Pharmacist',
  inventory: 'Inventory Officer',
  cashier: 'Cashier',
  support: 'Support',
};

export const PERSONA_FOCUS: Record<Persona, string> = {
  owner: 'Business performance, compliance & finance',
  manager: 'Branch operations & fulfilment',
  pharmacist: 'Prescription verification & dispensing',
  inventory: 'Stock, pricing & product catalog',
  cashier: 'Counter sales & receipts',
  support: 'Customer orders & assistance',
};

export type NavItem = {
  label: string;
  href: string;
  icon: IconKey;
  /**
   * Permission required to see this item; absent = all staff. Permission-driven so
   * that editing a role's permissions (Roles page) directly controls module access.
   */
  permission?: string;
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
    items: [{ label: 'Prescriptions', href: '/prescriptions', icon: 'rx', permission: 'rx:read' }],
  },
  {
    heading: 'Sales',
    items: [{ label: 'Point of Sale', href: '/pos', icon: 'cash', permission: 'pos:sell' }],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Orders', href: '/orders', icon: 'orders', permission: 'order:read' },
      { label: 'Deliveries', href: '/deliveries', icon: 'orders', permission: 'order:transition' },
      { label: 'Inventory', href: '/inventory', icon: 'inventory', permission: 'inventory:read' },
      {
        label: 'Stock adjustments',
        href: '/adjustments',
        icon: 'inventory',
        permission: 'inventory:adjust',
      },
      { label: 'Vendors', href: '/vendors', icon: 'vendor', permission: 'vendor:read' },
    ],
  },
  {
    heading: 'Catalog',
    items: [
      { label: 'Products', href: '/products', icon: 'catalog', permission: 'catalog:write' },
      // Read-only selling-price lookup for counter staff (client request).
      { label: 'Price list', href: '/prices', icon: 'pricing', permission: 'pricing:read' },
      { label: 'Branches', href: '/branches', icon: 'branch', permission: 'branch:write' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      {
        label: 'Payments & Refunds',
        href: '/finance',
        icon: 'finance',
        permission: 'refund:create',
      },
      { label: 'Reports', href: '/reports', icon: 'reports', permission: 'report:read' },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Leads', href: '/leads', icon: 'bell', permission: 'audit:read' },
      { label: 'Audit Log', href: '/audit', icon: 'audit', permission: 'audit:read' },
      { label: 'Staff & Access', href: '/staff', icon: 'staff', permission: 'staff:read' },
      { label: 'Roles', href: '/roles', icon: 'shield', permission: 'role:read' },
    ],
  },
];

function canSee(item: NavItem, permissions: string[]): boolean {
  if (!item.permission) return true;
  return permissions.includes(item.permission);
}

/** Sections with items the given permissions may see (empty sections dropped). */
export function visibleNav(permissions: string[]): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i, permissions)) })).filter(
    (s) => s.items.length > 0,
  );
}

export function initialsOf(firstName?: string, lastName?: string): string {
  const a = firstName?.[0] ?? '';
  const b = lastName?.[0] ?? '';
  return (a + b || 'LN').toUpperCase();
}
