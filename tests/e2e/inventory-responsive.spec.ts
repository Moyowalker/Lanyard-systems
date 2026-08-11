import { test, expect } from '@playwright/test';

const ADMIN = 'http://localhost:3001';

const viewports = [
  { name: 'mobile-320', width: 320, height: 800 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];

test('inventory has no page-level horizontal overflow at required viewports', async ({ page }, testInfo) => {
  await page.goto(`${ADMIN}/login`);
  await page.getByPlaceholder('you@lanyard.health').fill('superintendent@lanyard.test');
  await page.getByPlaceholder('Enter your password').fill('Passw0rd!');
  await Promise.all([
    page.waitForURL(`${ADMIN}/`),
    page.getByRole('button', { name: 'Continue to secure sign in' }).click(),
  ]);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${ADMIN}/inventory`);
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Receive stock' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-inventory.png`), fullPage: true });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })),
      )
      .toEqual({ clientWidth: viewport.width, scrollWidth: viewport.width });
  }
});