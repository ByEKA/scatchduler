import { expect, test } from '@playwright/test';

test('browses cross-workspace schedules on /library, filters with URL persistence, and opens a schedule', async ({
  page,
}) => {
  await page.goto('/home');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Library' })
    .click();

  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'My workspace' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Site Operations' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shared with me' })).toBeVisible();

  // Filter via search + Hide empty and reload to verify URL persistence
  await page.getByRole('searchbox', { name: 'Search library' }).fill('Look-ahead');
  await page.getByRole('checkbox', { name: 'Hide empty' }).check();
  await expect(page).toHaveURL(/q=Look-ahead/);
  await expect(page).toHaveURL(/nonEmpty=1/);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Site Operations' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'My workspace' })).toHaveCount(0);

  // Open the matching schedule directly into the schedule editor
  await page.getByRole('link', { name: 'Open', exact: true }).first().click();
  await expect(page).toHaveURL(/\/schedule\?scheduleId=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Look-ahead W42' })).toBeVisible();
});
