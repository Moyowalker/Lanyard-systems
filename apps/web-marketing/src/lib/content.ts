import type { BranchSummaryDto } from '@lanyard/contracts';

export const marketingNav = [
  { label: 'How it works', href: '/services' },
  { label: 'Branches', href: '/branches' },
  { label: 'About', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
] as const;

export const heroStats = [
  { value: '~60 min', label: 'typical delivery time across Lagos when in stock' },
  { value: '100%', label: 'NAFDAC-registered, genuine medicines' },
  { value: 'Free', label: 'pickup at your nearest branch' },
] as const;

export const serviceTracks = [
  {
    title: 'Delivery to your door',
    body: 'Order what you need and have it brought to you — often within the hour across Lagos.',
    bullets: [
      'About 60 minutes when your branch has it in stock',
      'Live tracking from order to your door',
      'Pay by card, bank transfer, or USSD',
    ],
  },
  {
    title: 'Free branch pickup',
    body: 'Reserve online and collect at the counter, with no queue and no surprises on price.',
    bullets: [
      'Ready shortly after you order',
      'Switch to a branch near you anytime',
      'See real stock before you leave home',
    ],
  },
  {
    title: 'Prescriptions made easy',
    body: 'Upload your prescription and a licensed pharmacist verifies it before anything is dispensed.',
    bullets: [
      'Secure upload at checkout',
      'Reviewed by a licensed pharmacist',
      'Dispensed only once approved',
    ],
  },
] as const;

export const principles = [
  {
    title: 'Genuine medicines, always',
    body: 'Every product is NAFDAC-registered and dispensed by a licensed pharmacy. No fakes, no guesswork.',
  },
  {
    title: 'A real pharmacist on every order',
    body: 'Prescription medicines are reviewed by a licensed pharmacist before they are ever dispensed.',
  },
  {
    title: 'Fair, branch-accurate prices',
    body: 'You see the real price and stock for your branch before you pay — no surprises at checkout.',
  },
  {
    title: 'Fast, wherever you are in Lagos',
    body: 'Delivery to your door or free pickup, with live tracking from order to handoff.',
  },
] as const;

export const faqs = [
  {
    question: 'Can I order prescription medicines online?',
    answer:
      'Yes. Add them to your cart and upload your prescription at checkout — a licensed pharmacist verifies it before your order is dispensed.',
  },
  {
    question: 'How fast is delivery?',
    answer:
      'Most deliveries in Lagos arrive in about an hour when your branch has the item in stock. You can also choose free pickup.',
  },
  {
    question: 'Are the medicines genuine?',
    answer:
      'Yes. Every medicine is NAFDAC-registered and dispensed by a licensed pharmacy you can trust.',
  },
  {
    question: 'Can I pick up instead of having it delivered?',
    answer:
      'Yes. Choose pickup at checkout and collect from your branch — usually ready shortly after you order.',
  },
  {
    question: 'Do prices change by branch?',
    answer:
      'Yes. You always see the price and availability for the branch you choose before you pay.',
  },
  {
    question: 'How do I pay?',
    answer: 'Pay securely at checkout by card, bank transfer, or USSD.',
  },
] as const;

export const contactChannels = [
  {
    title: 'Order & care support',
    detail: '+234 800 000 0001',
    note: 'Order help, branch guidance, and prescription questions.',
  },
  {
    title: 'General enquiries',
    detail: 'hello@lanyard.test',
    note: 'Brand, branch, and service questions.',
  },
  {
    title: 'Partnerships',
    detail: 'partners@lanyard.test',
    note: 'Employer health plans, branch expansion, and healthcare partnerships.',
  },
] as const;

export const fallbackBranches: BranchSummaryDto[] = [
  {
    id: 'preview-ago',
    code: 'LAG-AGO-01',
    name: 'Lanyard Pharmacy',
    status: 'ACTIVE',
    address: { line1: '86 Ago Palace way', city: 'Lagos', state: 'Lagos State', lat: 6.5136, lng: 3.3347 },
    fulfillment: { pickup: true, delivery: true },
  },
];
