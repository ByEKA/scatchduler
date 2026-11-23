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
    .filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });

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

test('creates a folder, duplicates a schedule into it, and runs bulk Move and Archive actions', async ({
  page,
}) => {
  await openHarbor(page);

  const foldersNav = page.getByRole('navigation', { name: 'Folders' });
  await foldersNav.getByRole('button', { name: 'New folder' }).click();
  const folderDialog = page.getByRole('dialog', { name: 'New folder' });
  await folderDialog.getByLabel('Folder name').fill('Tender');
  await folderDialog.getByRole('button', { name: 'Create folder' }).click();
  await expect(page.getByText('Folder created')).toBeVisible();
  await expect(foldersNav.getByRole('button', { name: /^Tender/i })).toBeVisible();

  // Duplicate Update 2 into Tender
  await page.getByRole('button', { name: 'Actions for Update 2' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate…' }).click();
  const copyDialog = page.getByRole('dialog', { name: 'Duplicate schedule' });
  await expect(copyDialog.getByLabel('Name')).toHaveValue('Update 2 (copy)');
  await copyDialog.getByLabel('Folder').selectOption({ label: 'Tender' });
  await copyDialog.getByRole('button', { name: 'Duplicate schedule' }).click();
  await expect(page.getByText('Schedule duplicated')).toBeVisible();

  // Filter by Tender folder and open duplicated schedule in editor
  await foldersNav.getByRole('button', { name: /^Tender/i }).click();
  await expect(row(page, 'Update 2 (copy)')).toBeVisible();
  await expect(row(page, 'Baseline')).toHaveCount(0);

  // Return to All schedules and bulk archive Baseline & Update 1
  await foldersNav.getByRole('button', { name: /^All schedules/i }).click();
  await page.getByRole('checkbox', { name: 'Select Baseline' }).check();
  await page.getByRole('checkbox', { name: 'Select Update 1' }).check();

  const bulkBar = page.getByRole('region', { name: 'Bulk actions' });
  await expect(bulkBar).toContainText('2 selected');
  await bulkBar.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Archived 2 schedules')).toBeVisible();
  await expect(row(page, 'Baseline')).toHaveCount(0);
  await expect(row(page, 'Update 1')).toHaveCount(0);
});


