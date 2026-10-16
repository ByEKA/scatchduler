import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
});

test('Home shows the seeded data', async ({ page }) => {
  const recent = page.getByRole('region', { name: 'Recent projects' });
  await expect(recent.getByRole('article')).toHaveCount(5);
  await expect(recent.getByRole('button', { name: 'Create new project' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shared with me' }).getByRole('row')).toHaveCount(
    3,
  );
  const workspaces = page.getByRole('region', { name: 'Workspaces' });
  await expect(workspaces.getByRole('listitem')).toHaveCount(2);
  await expect(workspaces.getByRole('button', { name: /Site Operations/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'To do' }).getByRole('checkbox')).toHaveCount(3);
});

test('the sidebar state survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(page.locator('#app-sidebar')).toHaveAttribute('data-state', 'closed');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
});

test('switching workspace works with the keyboard only', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch workspace' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('site');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/w\/[^/]+\/projects$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  // The top bar's workspace link is named after the current workspace.
  await expect(page.getByRole('link', { name: 'Site Operations', exact: true })).toBeVisible();
});

test('a schedule can be created from the banner', async ({ page }) => {
  await page.getByRole('button', { name: 'New schedule' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Look-ahead W43');
  await page.getByRole('button', { name: 'Create schedule' }).click();
  await expect(page.getByText('Schedule created')).toBeVisible();
  await expect(page).toHaveURL(/\/schedule\?scheduleId=/);
});

test('a project can be created through the wizard', async ({ page }) => {
  await page.getByRole('button', { name: 'New project', exact: true }).click(); // not the "Create new project" card
  await page.getByLabel('Project name', { exact: true }).fill('Pier 9');
  await page.getByLabel('Project ID', { exact: true }).fill('007');
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project created')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Recent projects' }).getByRole('article').first(),
  ).toContainText('Pier 9');
});

test('a schedule file can be imported', async ({ page }) => {
  await page.getByRole('button', { name: 'Import schedule', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Rev7.XER',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('x'),
  });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rev7');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();
  await expect(page).toHaveURL(/\/schedule\?scheduleId=/);
});

test('a team workspace can be created', async ({ page }) => {
  const workspaces = page.getByRole('region', { name: 'Workspaces' });
  await workspaces.getByRole('button', { name: 'New team workspace', exact: true }).click();
  await page.getByLabel('Workspace name', { exact: true }).fill('Field crew');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByText('Workspace created')).toBeVisible();
  await expect(workspaces.getByRole('button', { name: /Field crew/ })).toBeVisible();
});

test('the theme choice survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Account menu for Deniz Kaya' }).click();
  await page.getByRole('menuitem', { name: 'Light mode' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

for (const width of [1440, 1024, 768, 375]) {
  test(`screenshot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Recent projects' }).getByRole('article'),
    ).toHaveCount(5);
    await expect(page.getByRole('region', { name: 'Shared with me' }).getByRole('row')).toHaveCount(
      3,
    );
    await expect(
      page
        .getByRole('region', { name: 'Workspaces' })
        .getByRole('button', { name: /Site Operations/ }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'To do' }).getByRole('checkbox')).toHaveCount(3);
    // The shell is 100dvh and only main scrolls, so fullPage alone stops at the viewport; grow it
    // to main's content plus the 48 px top bar so the shot shows every Home section.
    const height = await page.locator('main').evaluate((el) => el.scrollHeight + 48);
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/screens/home-${width}.png`, fullPage: true });
  });
}
