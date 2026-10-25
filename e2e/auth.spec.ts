import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Account menu for Deniz Kaya' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signing back in with a password', async ({ page }) => {
  await page.getByLabel('Email', { exact: true }).fill('deniz.kaya@example.com');
  await page.getByLabel('Password', { exact: true }).fill('any-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
});

test('continuing with Google in demo mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
});
