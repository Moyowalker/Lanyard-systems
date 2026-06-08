# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer.spec.ts >> customer can browse the branch catalog, log in via OTP, and add to cart
- Location: tests\e2e\customer.spec.ts:5:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('div.rounded-xl').filter({ hasText: 'Paracetamol 500mg' }).first().getByRole('button', { name: 'Added ✓' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('div.rounded-xl').filter({ hasText: 'Paracetamol 500mg' }).first().getByRole('button', { name: 'Added ✓' })

```

```yaml
- banner:
  - link "Lanyard Pharmacy":
    - /url: /
  - textbox "Search medicines…"
  - combobox "Select branch":
    - option "Lanyard Pharmacy — Ikeja — Ikeja" [selected]
    - option "Lanyard � Lekki — Lekki"
  - link "Sign in":
    - /url: /account/login
  - link "Cart":
    - /url: /cart
- main:
  - heading "Your pharmacy, online." [level=1]
  - paragraph: Browse medicines, upload a prescription, and choose pickup or delivery from Lanyard Pharmacy — Ikeja, Ikeja.
  - heading "Categories" [level=2]
  - link "Pain Relief":
    - /url: /category/pain-relief
  - link "Antibiotics":
    - /url: /category/antibiotics
  - heading "Available at Lanyard Pharmacy — Ikeja" [level=2]
  - link "Paracetamol 500mg tablet · 500mg":
    - /url: /products/paracetamol-500mg
    - heading "Paracetamol 500mg" [level=3]
    - paragraph: tablet · 500mg
  - text: ₦800.00 100 in stock
  - button "Add to cart"
  - link "Amoxicillin 500mg ℞ Prescription capsule · 500mg":
    - /url: /products/amoxicillin-500mg
    - heading "Amoxicillin 500mg" [level=3]
    - text: ℞ Prescription
    - paragraph: capsule · 500mg
  - text: ₦3,500.00 100 in stock
  - button "Add to cart"
- contentinfo: Lanyard Pharmacy — prescription-only medicines are dispensed only after pharmacist verification.
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const PHONE = '+2348012345678'; // seeded dev customer
  4  | 
  5  | test('customer can browse the branch catalog, log in via OTP, and add to cart', async ({
  6  |   page,
  7  | }) => {
  8  |   // 1. SSR catalog renders real products.
  9  |   await page.goto('/');
  10 |   await expect(page.getByText('Paracetamol 500mg').first()).toBeVisible();
  11 | 
  12 |   // 2. OTP login (dev surfaces the code on the page).
  13 |   await page.goto('/account/login');
  14 |   await page.getByPlaceholder('+2348012345678').fill(PHONE);
  15 |   await page.getByRole('button', { name: 'Send code' }).click();
  16 |   const devText = await page.getByText(/Dev code:/).textContent();
  17 |   const code = (devText ?? '').match(/\d{6}/)?.[0];
  18 |   expect(code).toBeTruthy();
  19 |   await page.getByPlaceholder('123456').fill(code!);
  20 |   await page.getByRole('button', { name: 'Verify & sign in' }).click();
  21 | 
  22 |   // 3. Signed in — header shows account + Orders link.
  23 |   await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  24 | 
  25 |   // 4. Add the OTC product to cart from its card.
  26 |   await page.goto('/');
  27 |   const card = page.locator('div.rounded-xl', { hasText: 'Paracetamol 500mg' }).first();
  28 |   await card.getByRole('button', { name: 'Add to cart' }).click();
> 29 |   await expect(card.getByRole('button', { name: 'Added ✓' })).toBeVisible();
     |                                                               ^ Error: expect(locator).toBeVisible() failed
  30 | 
  31 |   // 5. Cart reflects the item.
  32 |   await page.goto('/cart');
  33 |   await expect(page.getByText('Paracetamol 500mg').first()).toBeVisible();
  34 |   await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible();
  35 | });
  36 | 
```