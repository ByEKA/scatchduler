import { expect, test } from '@playwright/test';

const fixture = (name: string) => `src/import/__fixtures__/${name}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await page
    .getByRole('region', { name: 'Recent projects' })
    .getByRole('link', { name: 'Metro Line Extension' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /Metro Line Extension/ })).toBeVisible();
});

test('a Windows-1254 CSV is imported with its column mapping', async ({ page }) => {
  await page.getByRole('button', { name: 'Import schedule' }).first().click();
  await page.locator('input[type="file"]').setInputFiles(fixture('turkish-1254.csv'));
  await expect(page.getByText('CSV file')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Detected: Turkish (Windows-1254)')).toBeVisible();
  await expect(page.getByRole('table', { name: 'First 10 rows' })).toContainText(
    'Şantiye kurulumu',
  );
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Code', { exact: true }).fill('CSV-1');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Schedules' })).toContainText('turkish-1254');
  await page.getByRole('button', { name: 'Actions for turkish-1254' }).click();
  await page.getByRole('menuitem', { name: 'View import report' }).click();
  await expect(page.getByRole('dialog', { name: 'Import report' })).toContainText(
    'turkish-1254.csv',
  );
});

test('the second project of a two-project XER is imported and its report opens from the row', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Import schedule' }).first().click();
  await page.locator('input[type="file"]').setInputFiles(fixture('two-projects.xer'));
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'Use NTH-B · North Annex' }).check();
  await expect(page.getByLabel('Code', { exact: true })).toHaveValue('NTH-B');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();
  const row = page
    .getByRole('table', { name: 'Schedules' })
    .getByRole('row')
    .filter({ hasText: 'North Annex' });
  await expect(row).toContainText('Current');
  await page.getByRole('button', { name: 'Actions for North Annex' }).click();
  await page.getByRole('menuitem', { name: 'View import report' }).click();
  await expect(page.getByRole('dialog', { name: 'Import report' })).toContainText(
    'two-projects.xer',
  );
});

test('the report downloads as CSV', async ({ page }) => {
  await page.getByRole('button', { name: 'Import schedule' }).first().click();
  await page.locator('input[type="file"]').setInputFiles(fixture('two-projects.xer'));
  await page.getByRole('button', { name: 'Next' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe('North Plant - import report.csv');
});
