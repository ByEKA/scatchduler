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

test('creates a program and groups projects by program across reload', async ({ page }) => {
  await page.getByRole('button', { name: 'New program' }).click();
  const dialog = page.getByRole('dialog', { name: 'New program' });
  await dialog.getByLabel('Program name').fill('Transit Expansion');
  await dialog.getByRole('button', { name: 'Create program' }).click();
  await expect(page.getByText('Program created')).toBeVisible();

  await page.getByRole('button', { name: 'Group by program' }).click();
  await expect(page).toHaveURL(/group=program/);

  const portSection = page.getByRole('region', { name: 'Port & Industrial Program' });
  await expect(portSection).toContainText('Harbor Logistics Hub');
  await expect(page.getByRole('region', { name: 'Transit Expansion' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'No program' })).toContainText(
    'Riverside Office Tower',
  );

  await page.reload();
  await expect(page.getByRole('region', { name: 'Port & Industrial Program' })).toBeVisible();
});

test('switches to Map layout with interactive pins, Not on the map panel, and zero external requests', async ({
  page,
}) => {
  const externalUrls: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && !url.startsWith('data:')) {
      externalUrls.push(url);
    }
  });

  await page.getByRole('radio', { name: 'Map' }).click();
  await expect(page.getByRole('img', { name: 'Projects coordinate map' })).toBeVisible();

  // Click Harbor pin -> detail card shows client, city, coordinates and Open project link
  await page.getByRole('button', { name: 'Harbor Logistics Hub (003)' }).click();
  const card = page.getByRole('region', { name: 'Harbor Logistics Hub' });
  await expect(card).toContainText('Aegean Ports · Izmir');
  await expect(card).toContainText('38.4192, 27.1287');
  await expect(card.getByRole('link', { name: 'Open project' })).toBeVisible();

  // Zoom controls & Not on the map side panel
  const zoomBefore = await page.getByTestId('map-zoom-level').textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByTestId('map-zoom-level')).not.toHaveText(zoomBefore ?? '');

  const notOnMap = page.getByRole('complementary', { name: 'Not on the map' });
  await expect(notOnMap.getByRole('heading', { name: 'Not on the map (2)' })).toBeVisible();
  await expect(notOnMap).toContainText('Campus Library Retrofit');
  await expect(notOnMap).toContainText('Old Mill Housing');

  // Map layout persists across reload with zero external network requests (V5)
  await page.reload();
  await expect(page.getByRole('img', { name: 'Projects coordinate map' })).toBeVisible();
  expect(externalUrls).toEqual([]);
});

