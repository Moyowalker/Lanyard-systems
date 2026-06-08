import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:3001';

test('staff can sign in and reach the operations console', async ({ page }) => {
  // Unauthenticated → redirected to login by middleware.
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(/\/login$/);

  // Sign in (seeded superintendent, MFA off).
  await page.getByPlaceholder('Email').fill('superintendent@lanyard.test');
  await page.getByPlaceholder('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Dashboard with the operational cards.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Prescriptions to verify')).toBeVisible();

  // Orders console loads (exact match → the nav link, not the dashboard card).
  await page.getByRole('link', { name: 'Orders', exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

  // Prescription queue loads.
  await page.getByRole('link', { name: 'Prescriptions', exact: true }).click();
  await expect(page).toHaveURL(/\/prescriptions$/);
});
