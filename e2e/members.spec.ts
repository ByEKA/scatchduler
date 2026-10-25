import { expect, test } from '@playwright/test';

test('an owner invites someone and revokes the invitation', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Members of Site Operations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Members of Site Operations' });
  await dialog.getByLabel('Email', { exact: true }).fill('new.person@example.com');
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invitation sent to new.person@example.com')).toBeVisible();
  await dialog.getByRole('button', { name: 'Revoke invitation to new.person@example.com' }).click();
  await expect(page.getByText('Invitation revoked')).toBeVisible();
});
