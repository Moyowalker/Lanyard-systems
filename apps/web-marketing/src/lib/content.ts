import type { BranchSummaryDto } from '@lanyard/contracts';

export const marketingNav = [
  { label: 'How it works', href: '/services' },
  { label: 'Branches', href: '/branches' },
  { label: 'About', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
] as const;

export const heroStats = [
  { value: '~60 min', label: 'delivery in Lagos when your item is in stock' },
  { value: '100%', label: 'genuine, NAFDAC-registered medicines' },
  { value: 'Free', label: 'pickup at your nearest branch' },
] as const;

export const serviceTracks = [
  {
    title: 'Delivery to your door',
    body: 'Order from a nearby Lanyard branch and get your medicine brought to you, often within the hour.',
    bullets: [
      'About 60 minutes when the item is in stock',
      'Updates from order to delivery',
      'Pay by card, bank transfer, or USSD',
    ],
  },
  {
    title: 'Free branch pickup',
    body: 'Reserve online and collect from the branch that works best for you.',
    bullets: [
      'Ready shortly after you order',
      'Choose a branch near you',
      'Check stock before you leave home',
    ],
  },
  {
    title: 'Prescriptions made easy',
    body: 'Send your prescription online and our licensed pharmacist checks it before we prepare your medicine.',
    bullets: [
      'Secure upload at checkout',
      'Reviewed by a licensed pharmacist',
      'Prepared only after approval',
    ],
  },
] as const;

export const principles = [
  {
    title: 'Genuine medicines, always',
    body: 'Every medicine comes through a licensed pharmacy and is NAFDAC-registered. No fakes, no guesswork.',
  },
  {
    title: 'A real pharmacist checks prescriptions',
    body: 'If your medicine needs a prescription, a licensed pharmacist reviews it before we prepare your order.',
  },
  {
    title: 'Clear prices before you pay',
    body: 'You see the price and availability for your chosen branch before checkout.',
  },
  {
    title: 'Fast, wherever you are in Lagos',
    body: 'Choose delivery to your door or free pickup from a branch near you.',
  },
] as const;

export const faqs = [
  {
    question: 'Can I order prescription medicines online?',
    answer:
      'Yes. Add the medicine to your cart and upload your prescription at checkout. A licensed pharmacist checks it before we prepare your order.',
  },
  {
    question: 'How fast is delivery?',
    answer:
      'Most deliveries in Lagos arrive in about an hour when your branch has the item in stock. You can also choose free pickup.',
  },
  {
    question: 'Are the medicines genuine?',
    answer:
      'Yes. We only sell genuine, NAFDAC-registered medicines through licensed Lanyard pharmacy branches.',
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
    detail: '+234 708 816 7402',
    note: 'Help with orders, branch pickup, delivery, and prescriptions.',
  },
  {
    title: 'General enquiries',
    detail: 'hello@lanyardpharmacy.com',
    note: 'Questions about Lanyard branches and services.',
  },
  {
    title: 'Partnerships',
    detail: 'partnerships@lanyardpharmacy.com',
    note: 'For employer health plans, new locations, and healthcare partnerships.',
  },
] as const;

export const fallbackBranches: BranchSummaryDto[] = [
  {
    id: 'preview-ago',
    code: 'LAG-AGO-01',
    name: 'Lanyard Pharmacy',
    status: 'ACTIVE',
    address: {
      line1: '86 Ago Palace way',
      city: 'Lagos',
      state: 'Lagos State',
      lat: 6.5136,
      lng: 3.3347,
    },
    fulfillment: { pickup: true, delivery: true },
  },
];
