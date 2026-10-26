import { expect, test, type Page } from '@playwright/test';
import { readLocalStack } from '../integration/local-stack';
import { tokenHashFrom, waitForEmail } from '../integration/mailbox';

const PASSWORD = 'localdemo2026';

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('a seeded account signs in with a password', async ({ page }) => {
  await signIn(page, 'deniz.kaya@example.com');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Recent projects' }).getByRole('article'),
  ).toHaveCount(5);
});

test('created data is still there after a reload', async ({ page }) => {
  await signIn(page, 'deniz.kaya@example.com');
  const name = `E2E crew ${Date.now() % 100_000}`;
  const workspaces = page.getByRole('region', { name: 'Workspaces' });
  await workspaces.getByRole('button', { name: 'New team workspace', exact: true }).click();
  await page.getByLabel('Workspace name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(workspaces.getByRole('button', { name: new RegExp(`^${name}\\b`) })).toBeVisible();
  await page.reload();
  await expect(workspaces.getByRole('button', { name: new RegExp(`^${name}\\b`) })).toBeVisible();
});

test('a viewer cannot create anything in the team workspace', async ({ page }) => {
  await signIn(page, 'elif.arslan@example.com');
  await page
    .getByRole('region', { name: 'Workspaces' })
    .getByRole('button', { name: /^Site Operations/ })
    .click();
  await page.goto('/home');
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('an invited person accepts and lands in the team workspace', async ({ page, browser }) => {
  const stack = readLocalStack();
  const email = `invitee.${Date.now()}@example.com`;
  await signIn(page, 'deniz.kaya@example.com');
  await page.getByRole('button', { name: 'Members of Site Operations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Members of Site Operations' });
  const sentAfter = new Date();
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

  const mail = await waitForEmail(stack.mailUrl, email, {
    after: sentAfter,
    subject: "You're invited to AppName",
  });
  const context = await browser.newContext({ baseURL: 'http://localhost:4174' });
  const invitee = await context.newPage();
  await invitee.goto(`/accept-invite?token_hash=${tokenHashFrom(mail.html)}&type=invite`);
  await invitee.getByLabel('First name', { exact: true }).fill('Ada');
  await invitee.getByLabel('Last name', { exact: true }).fill('Lovelace');
  await invitee.getByLabel('Password', { exact: true }).fill('letters12345');
  await invitee.getByLabel('Confirm password', { exact: true }).fill('letters12345');
  await invitee.getByRole('button', { name: 'Create account' }).click();
  await expect(invitee.getByRole('heading', { level: 1, name: 'Hello, Ada' })).toBeVisible();
  await expect(
    invitee
      .getByRole('region', { name: 'Workspaces' })
      .getByRole('button', { name: /^Site Operations/ }),
  ).toBeVisible();
  await context.close();
});
