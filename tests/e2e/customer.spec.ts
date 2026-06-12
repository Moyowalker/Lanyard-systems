import { test, expect } from '@playwright/test';

const PHONE = '+2348012345678'; // seeded dev customer

test('customer can browse the branch catalog, log in via OTP, and add to cart', async ({
  page,
}) => {
  // 1. SSR catalog renders real products.
  await page.goto('/');
  await expect(page.getByText('Paracetamol 500mg').first()).toBeVisible();

  // 2. OTP login (dev surfaces the code on the page).
  await page.goto('/account/login');
  await page.getByPlaceholder('+2348012345678').fill(PHONE);
  await page.getByRole('button', { name: 'Send code' }).click();
  const devText = await page.getByText(/Dev code:/).textContent();
  const code = (devText ?? '').match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();
  await page.getByPlaceholder('123456').fill(code!);
  await page.getByRole('button', { name: 'Verify & sign in' }).click();

  // 3. Signed in — header shows account + Orders link.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // 4. Add the OTC product to cart from its card.
  await page.goto('/');
  const card = page.locator('article', { hasText: 'Paracetamol 500mg' }).first();
  await expect(card).toBeVisible();
  const addButton = card.getByRole('button', { name: 'Add to cart' });
  if (await addButton.isVisible()) {
    await addButton.click();
  }
  await expect(card.getByRole('button', { name: 'Added to cart' })).toBeVisible();

  // 5. Cart reflects the item.
  await page.goto('/cart');
  await expect(page.getByText('Paracetamol 500mg').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Proceed to checkout' })).toBeVisible();
});
