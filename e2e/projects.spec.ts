import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Projects' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('the list layout survives a reload', async ({ page }) => {
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByRole('table', { name: 'Projects' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: 'Projects' })).toBeVisible();
});

test('search and filters stay in the URL across a reload', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('harbor');
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Status', { exact: true }).click();
  await page.getByRole('option', { name: 'Active' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/q=harbor/);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText('Status: Active')).toBeVisible();
});

test("a project's attributes can be edited", async ({ page }) => {
  await page.getByRole('button', { name: 'Actions for Metro Line Extension' }).click();
  await page.getByRole('menuitem', { name: 'Edit project' }).click();
  await page.getByRole('button', { name: /Attributes/ }).click();
  await page.getByLabel('Status', { exact: true }).click();
  await page.getByRole('option', { name: 'On hold' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Project updated')).toBeVisible();
  await expect(
    page.getByRole('article').filter({ hasText: 'Metro Line Extension' }).getByText('On hold'),
  ).toBeVisible();
});

test('a project can be deleted after typing its ID', async ({ page }) => {
  await page.getByRole('button', { name: 'Actions for Old Mill Housing' }).click();
  await page.getByRole('menuitem', { name: 'Delete project' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete Old Mill Housing?' });
  await dialog.getByLabel('Project ID').fill('006');
  await dialog.getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByText('Project deleted')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(5);
});
