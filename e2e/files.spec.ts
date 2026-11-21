import { expect, test, type Page } from '@playwright/test';

async function openHarbor(page: Page) {
  await page.goto('/home');
  await page
    .getByRole('region', { name: 'Recent projects' })
    .getByRole('link', { name: 'Harbor Logistics Hub' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /Harbor Logistics Hub/ })).toBeVisible();
}

// The row whose text starts with the schedule's name ("Baseline" must not match "Primary baseline").
const row = (page: Page, name: string) =>
  page
    .getByRole('table', { name: 'Schedules' })
    .getByRole('row')
    .filter({ hasText: new RegExp(`^${name}`) });

test('another schedule becomes current and gets its details', async ({ page }) => {
  await openHarbor(page);
  await page.getByRole('button', { name: 'Actions for Update 1' }).click();
  await page.getByRole('menuitem', { name: 'Make current' }).click();
  await expect(page.getByText('Schedule is now current')).toBeVisible();
  await expect(row(page, 'Update 1')).toContainText('Current');
  await page.getByRole('button', { name: 'Actions for Update 1' }).click();
  await page.getByRole('menuitem', { name: 'Edit details' }).click();
  await page.getByRole('radio', { name: 'Primary baseline' }).click();
  await page.getByLabel('Notes').fill('Revised crane plan');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Details saved')).toBeVisible();
  await expect(row(page, 'Update 1')).toContainText('Primary baseline');
  await expect(row(page, 'Baseline')).not.toContainText('Primary baseline');
});

test('a schedule is archived, shown with Show archived, and restored', async ({ page }) => {
  await openHarbor(page);
  await page.getByRole('button', { name: 'Actions for Baseline' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByText('Schedule archived')).toBeVisible();
  await expect(row(page, 'Baseline')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Show archived' }).check();
  await expect(row(page, 'Baseline')).toContainText('Archived');
  await page.getByRole('button', { name: 'Actions for Baseline' }).click();
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await expect(page.getByText('Schedule restored')).toBeVisible();
});

test('a schedule is deleted after confirming', async ({ page }) => {
  await openHarbor(page);
  await page.getByRole('button', { name: 'Actions for Baseline' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete Baseline?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('Schedule deleted')).toBeVisible();
  await expect(row(page, 'Baseline')).toHaveCount(0);
});

test('Open current schedule navigates to the schedule route', async ({ page }) => {
  await openHarbor(page);
  await page.getByRole('link', { name: 'Open current schedule' }).click();
  await expect(page).toHaveURL(/\/schedule\?scheduleId=/);
});

