import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export const IconDashboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconRx = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 21V5a1 1 0 0 1 1-1h4.5a3.5 3.5 0 0 1 0 7H5" />
    <path d="M9 11l7 9" />
    <path d="M14 14l5-5" />
  </svg>
);

export const IconOrders = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const IconInventory = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 8 12 3 3 8l9 5 9-5Z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

export const IconCatalog = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4h7v16H6a2 2 0 0 1-2-2Z" />
    <path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5Z" />
    <path d="M16 9h1M16 13h1" />
  </svg>
);

export const IconBranch = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const IconPricing = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20.6 13.4 13 21l-9-9V4h8l8.6 8.6a1.4 1.4 0 0 1 0 2Z" />
    <circle cx="8.5" cy="8.5" r="1.5" />
  </svg>
);

export const IconFinance = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 17l5-5 4 4 8-8" />
    <path d="M16 8h5v5" />
  </svg>
);

export const IconStaff = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 4.5a3.2 3.2 0 0 1 0 6.4" />
    <path d="M17 14.5a6 6 0 0 1 4 5.5" />
  </svg>
);

export const IconAudit = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 3h6l1 3h3a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1h3Z" />
    <path d="M9 13l2 2 4-4" />
  </svg>
);

export const IconBell = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconMenu = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconArrowUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </svg>
);

export const IconArrowDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14" />
    <path d="M6 13l6 6 6-6" />
  </svg>
);

export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconCash = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 9v6M18 9v6" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

export const IconShield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" />
    <path d="M9.5 12l1.8 1.8L15 10" />
  </svg>
);

/** Named registry so nav config can reference icons by string key. */
export const IconReports = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="8" y="11" width="3" height="6" rx="0.5" />
    <rect x="13.5" y="7" width="3" height="10" rx="0.5" />
  </svg>
);

export const Icons = {
  dashboard: IconDashboard,
  rx: IconRx,
  orders: IconOrders,
  inventory: IconInventory,
  catalog: IconCatalog,
  branch: IconBranch,
  pricing: IconPricing,
  finance: IconFinance,
  staff: IconStaff,
  audit: IconAudit,
  bell: IconBell,
  reports: IconReports,
  shield: IconShield,
  cash: IconCash,
} as const;

export type IconKey = keyof typeof Icons;
