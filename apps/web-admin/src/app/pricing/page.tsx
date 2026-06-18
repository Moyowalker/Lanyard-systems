import { redirect } from 'next/navigation';

// Pricing has been merged into the Inventory page (Stock / Pricing tabs).
// Keep this route as a redirect so existing links/bookmarks don't 404.
export default function PricingRedirectPage() {
  redirect('/inventory');
}
