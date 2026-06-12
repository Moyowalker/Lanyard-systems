import type { BranchSummaryDto } from '@lanyard/contracts';

export const marketingNav = [
  { label: 'About', href: '/about' },
  { label: 'Services', href: '/services' },
  { label: 'Branches', href: '/branches' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
] as const;

export const heroStats = [
  { value: '15 min', label: 'average same-branch pickup prep when stock is ready' },
  { value: '1 flow', label: 'for browsing, prescription upload, payment, and tracking' },
  { value: 'PCN aware', label: 'built around pharmacist verification and auditability' },
] as const;

export const serviceTracks = [
  {
    title: 'Pickup that feels immediate',
    body: 'Reserve medicines online, switch branches in seconds, and head to the counter with less friction.',
    bullets: [
      'Live branch-aware pricing',
      'Fast reorder-friendly experience',
      'Clear pickup status updates',
    ],
  },
  {
    title: 'Prescription-first digital care',
    body: 'Upload a prescription online, route it into verification, and keep customers informed without compromising compliance.',
    bullets: [
      'Pharmacist review workflow',
      'Secure prescription handling',
      'Order progression after verification',
    ],
  },
  {
    title: 'Delivery when you need reach',
    body: 'Support patients who cannot walk in, while keeping fulfillment grounded in real branch inventory and dispatch status.',
    bullets: [
      'Delivery-ready checkout',
      'Branch-scoped availability',
      'Order tracking after payment',
    ],
  },
] as const;

export const principles = [
  {
    title: 'Human warmth, not hospital coldness',
    body: 'The brand leans reassuring and polished instead of generic clinical UI. Clear enough to trust, warm enough to return to.',
  },
  {
    title: 'Commerce with a safety spine',
    body: 'Prescription checks, branch controls, and auditable workflows sit under every polished surface. The visual language should reflect that seriousness.',
  },
  {
    title: 'Built for Lagos pace',
    body: 'The experience is tuned for busy customers who want speed, branch flexibility, and strong confidence in the product they are buying.',
  },
  {
    title: 'Ready for multi-surface growth',
    body: 'Marketing, store, and staff operations can evolve independently while still feeling like one disciplined brand system.',
  },
] as const;

export const faqs = [
  {
    question: 'Can I order prescription-only medicines online?',
    answer:
      'Yes. Customers can upload a prescription, then a pharmacist verifies it before fulfillment progresses.',
  },
  {
    question: 'Do prices change by branch?',
    answer:
      'Yes. The store is branch-aware, so pricing and availability reflect the branch you choose before checkout.',
  },
  {
    question: 'Can I switch between pickup and delivery?',
    answer:
      'The customer flow supports both, with branch availability and operational fit shaping what is offered at checkout.',
  },
  {
    question: 'Is the same site used by staff?',
    answer:
      'No. Staff operations live in a separate admin console with different auth, branch controls, and compliance screens.',
  },
  {
    question: 'What if the nearest branch is out of stock?',
    answer:
      'Customers can switch branches in the store to view pricing and product availability before placing the order.',
  },
  {
    question: 'Why does the site emphasize verification so much?',
    answer:
      'For this business, prescription verification is not optional. It is the regulatory and safety core of the platform.',
  },
] as const;

export const contactChannels = [
  {
    title: 'General enquiries',
    detail: 'hello@lanyard.test',
    note: 'Use this for brand, branch, and service questions in the local demo environment.',
  },
  {
    title: 'Care desk',
    detail: '+234 800 000 0001',
    note: 'Best for order support, branch guidance, and prescription-related questions.',
  },
  {
    title: 'Partnerships',
    detail: 'partners@lanyard.test',
    note: 'For employer health plans, branch expansion, and healthcare commerce partnerships.',
  },
] as const;

export const fallbackBranches: BranchSummaryDto[] = [
  {
    id: 'preview-ikeja',
    code: 'LAG-IKEJA-01',
    name: 'Lanyard Pharmacy — Ikeja',
    status: 'ACTIVE',
    address: { line1: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos', lat: 6.6018, lng: 3.3515 },
    fulfillment: { pickup: true, delivery: true },
  },
  {
    id: 'preview-lekki',
    code: 'LAG-LEKKI-01',
    name: 'Lanyard Pharmacy — Lekki',
    status: 'COMING_SOON',
    address: { line1: '15 Admiralty Way', city: 'Lekki', state: 'Lagos', lat: 6.4433, lng: 3.4553 },
    fulfillment: { pickup: true, delivery: true },
  },
];
