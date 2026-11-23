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

test('an imported XER becomes current, shows its report and gives back its original', async ({
  page,
}) => {
  await signIn(page, 'deniz.kaya@example.com');
  await page
    .getByRole('region', { name: 'Recent projects' })
    .getByRole('link', { name: 'Metro Line Extension' })
    .click();
  await page.getByRole('button', { name: 'Import schedule' }).first().click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('src/import/__fixtures__/two-projects.xer');
  await page.getByRole('button', { name: 'Next' }).click();
  const code = `E2E-${Date.now() % 100000}`;
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();
  const row = page
    .getByRole('table', { name: 'Schedules' })
    .getByRole('row')
    .filter({ hasText: code });
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'Actions for North Plant' }).first().click();
  await page.getByRole('menuitem', { name: 'View import report' }).click();
  await expect(page.getByRole('dialog', { name: 'Import report' })).toContainText(
    'two-projects.xer',
  );
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.getByRole('button', { name: 'Actions for North Plant' }).first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download original file' }).click();
  expect((await download).suggestedFilename()).toBe('two-projects.xer');
});

test('a viewer sees the files page actions disabled', async ({ page }) => {
  await signIn(page, 'elif.arslan@example.com');
  await page
    .getByRole('region', { name: 'Workspaces' })
    .getByRole('button', { name: /^Site Operations/ })
    .click();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Projects' })
    .click();
  await page.getByRole('link', { name: 'Tunnel Ventilation Upgrade' }).first().click();
  await expect(page.getByRole('button', { name: 'New schedule' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Import schedule' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

async function openSiteOpsTunnelProject(page: Page) {
  await page
    .getByRole('region', { name: 'Workspaces' })
    .getByRole('button', { name: /^Site Operations/ })
    .click();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Projects' })
    .click();
  await page.getByRole('link', { name: 'Tunnel Ventilation Upgrade' }).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: /Tunnel Ventilation Upgrade/ }),
  ).toBeVisible();
}

test('imports XER, opens As imported, edits, calculates, saves to schedule-data and reloads', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page, 'deniz.kaya@example.com');
  await page
    .getByRole('region', { name: 'Recent projects' })
    .getByRole('link', { name: 'Harbor Logistics Hub' })
    .click();

  await page.getByRole('button', { name: 'Import schedule' }).first().click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('src/import/__fixtures__/two-projects.xer');
  await page.getByRole('button', { name: 'Next' }).click();
  const code = `P4-${Date.now() % 100000}`;
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();

  const scheduleRow = page
    .getByRole('table', { name: 'Schedules' })
    .getByRole('row')
    .filter({ hasText: code });
  await expect(scheduleRow).toBeVisible();
  await scheduleRow.getByRole('link', { name: 'North Plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'North Plant' })).toBeVisible();

  const statusBar = page.getByRole('region', { name: 'Schedule status' });
  await expect(statusBar).toContainText('As imported');

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: '+ Activity' })).toBeVisible();

  // Edit duration inline on A1030 (Pump install)
  const a1030Row = page
    .getByRole('treegrid', { name: 'Schedule activities' })
    .getByRole('row')
    .filter({ hasText: 'Pump install' });
  await a1030Row.click();
  await a1030Row.getByRole('gridcell').nth(3).dblclick();
  const durationInput = page.getByRole('textbox', { name: 'Edit duration for A1030' });
  await durationInput.fill('8d');
  await durationInput.press('Enter');
  await expect(a1030Row).toContainText('8 d');

  // Add a predecessor relationship (A1010 -> A1030 SS)
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('tab', { name: 'Relationships' }).click();
  const predSection = page.getByRole('region', { name: 'Predecessors' });
  const predTable = predSection.getByRole('table');
  await predSection
    .getByLabel('Predecessor activity')
    .selectOption({ label: 'A1010 · Kazı işleri' });
  await predSection.getByLabel('Predecessor link type').selectOption('SS');
  await predSection.getByRole('button', { name: 'Add predecessor' }).click();
  await expect(predTable).toContainText('Kazı işleri');

  // Calculate (F5) and save (Ctrl+S)
  await page.keyboard.press('F5');
  await expect(statusBar).toContainText('Calculated (P6)');
  await expect(statusBar).toContainText('Calculated in');

  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toContainText('Schedule saved');
  await expect(page.getByRole('button', { name: 'Done editing' })).toBeVisible();
  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  // Reload and assert persisted duration, relationship and calculated mode from schedule-data
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'North Plant' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Schedule status' })).toContainText(
    'Calculated (P6)',
  );
  const reloadedRow = page
    .getByRole('treegrid', { name: 'Schedule activities' })
    .getByRole('row')
    .filter({ hasText: 'Pump install' });
  await expect(reloadedRow).toContainText('8 d');

  await reloadedRow.click();
  const detailsBtn = page.getByRole('button', { name: 'Details', exact: true });
  if ((await detailsBtn.getAttribute('aria-pressed')) !== 'true') {
    await detailsBtn.click();
  }
  await page.getByRole('tab', { name: 'Relationships' }).click();
  await expect(
    page.getByRole('region', { name: 'Predecessors' }).getByRole('table'),
  ).toContainText('Kazı işleri');
});

test('shows edit lock across users, supports owner Force Unlock and keeps viewer read-only', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const ownerContext = await browser.newContext({ baseURL: 'http://localhost:4174' });
  const viewerContext = await browser.newContext({ baseURL: 'http://localhost:4174' });
  try {
    // Context 1 (Mert Demir): open Look-ahead W42 and acquire Edit lock
    await signIn(page, 'mert.demir@example.com');
    await openSiteOpsTunnelProject(page);
    await page.getByRole('link', { name: 'Open current schedule' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Look-ahead W42' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: '+ Activity' })).toBeVisible();

    // Context 2 (Deniz Kaya, owner): sees lock indicator on Files page, amber pill on editor, Force Unlocks and acquires Edit
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, 'deniz.kaya@example.com');
    await openSiteOpsTunnelProject(ownerPage);
    await expect(
      ownerPage.getByRole('img', { name: 'Being edited by Mert Demir' }),
    ).toBeVisible();

    await ownerPage.getByRole('link', { name: 'Look-ahead W42' }).click();
    await expect(
      ownerPage.getByRole('heading', { level: 1, name: 'Look-ahead W42' }),
    ).toBeVisible();
    await expect(ownerPage.getByText('Locked by Mert Demir')).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Unlock' }).click();
    const unlockDialog = ownerPage.getByRole('alertdialog', { name: 'Unlock this schedule?' });
    await expect(unlockDialog).toBeVisible();
    await unlockDialog.getByRole('button', { name: 'Unlock' }).click();

    await expect(ownerPage.getByRole('button', { name: 'Edit' })).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Edit' }).click();
    await expect(ownerPage.getByRole('button', { name: '+ Activity' })).toBeVisible();

    // Release lock cleanly before viewer opens
    await ownerPage.getByRole('button', { name: 'Done editing' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Edit' })).toBeVisible();

    // Context 3 (Elif Arslan, viewer): opens Look-ahead W42 read-only with disabled Edit
    const viewerPage = await viewerContext.newPage();
    await signIn(viewerPage, 'elif.arslan@example.com');
    await openSiteOpsTunnelProject(viewerPage);
    await viewerPage.getByRole('link', { name: 'Look-ahead W42' }).click();
    await expect(
      viewerPage.getByRole('heading', { level: 1, name: 'Look-ahead W42' }),
    ).toBeVisible();
    await expect(
      viewerPage.getByRole('treegrid', { name: 'Schedule activities' }),
    ).toContainText('Site mobilization');
    await expect(viewerPage.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  } finally {
    await ownerContext.close();
    await viewerContext.close();
  }
});

test('creates a folder, duplicates a materialized schedule into it, verifies copied snapshot and browses /library', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const suffix = String(Date.now() % 100000);
  const folderName = `Folder-${suffix}`;
  const copyCode = `CPY-${suffix}`;

  await signIn(page, 'deniz.kaya@example.com');
  await page
    .getByRole('region', { name: 'Recent projects' })
    .getByRole('link', { name: 'Harbor Logistics Hub' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /Harbor Logistics Hub/ })).toBeVisible();

  // Create a folder
  const foldersNav = page.getByRole('navigation', { name: 'Folders' });
  await foldersNav.getByRole('button', { name: 'New folder' }).click();
  const folderDialog = page.getByRole('dialog', { name: 'New folder' });
  await folderDialog.getByLabel('Folder name').fill(folderName);
  await folderDialog.getByRole('button', { name: 'Create folder' }).click();
  await expect(page.getByText('Folder created')).toBeVisible();

  // Duplicate Update 2 (materialized seeded schedule) into the new folder
  await page.getByRole('button', { name: 'Actions for Update 2', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate…' }).click();
  const copyDialog = page.getByRole('dialog', { name: 'Duplicate schedule' });
  await copyDialog.getByLabel('Code', { exact: true }).fill(copyCode);
  await copyDialog.getByLabel('Folder').selectOption({ label: folderName });
  await copyDialog.getByRole('button', { name: 'Duplicate schedule' }).click();
  await expect(page.getByText('Schedule duplicated')).toBeVisible();

  // Filter by the created folder and open the duplicated schedule in the editor
  await foldersNav.getByRole('button', { name: new RegExp(`^${folderName}`, 'i') }).click();
  const copyRow = page
    .getByRole('table', { name: 'Schedules' })
    .getByRole('row')
    .filter({ hasText: copyCode });
  await expect(copyRow).toBeVisible();
  await copyRow.getByRole('link', { name: 'Update 2 (copy)' }).click();

  // Verify copied gzipped snapshot from schedule-data loads its activities
  await expect(page.getByRole('heading', { level: 1, name: 'Update 2 (copy)' })).toBeVisible();
  await expect(
    page.getByRole('treegrid', { name: 'Schedule activities' }),
  ).toContainText('Site mobilization');

  // Verify it appears in /library with its folder badge
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Library' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search library' }).fill(copyCode);
  const personalSection = page.getByRole('region', { name: 'My workspace' });
  await expect(personalSection).toContainText('Update 2 (copy)');
  await expect(personalSection).toContainText(folderName);
});

