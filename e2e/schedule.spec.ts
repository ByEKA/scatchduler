import { expect, test, type Page } from '@playwright/test';

const XER_FIXTURE = 'src/import/__fixtures__/two-projects.xer';

async function openProject(page: Page, projectName: string) {
  await page.goto('/home');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Projects' })
    .click();
  await page.getByRole('link', { name: projectName }).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(projectName) }),
  ).toBeVisible();
}

test('imports XER, opens As imported, edits duration & link, calculates (F5), toggles paths, Undo/Redo, saves and reloads', async ({
  page,
}) => {
  await openProject(page, 'Harbor Logistics Hub');

  // Import two-projects.xer (North Plant / NTH-A)
  await page.getByRole('button', { name: 'Import schedule' }).first().click();
  await page.locator('input[type="file"]').setInputFiles(XER_FIXTURE);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported')).toBeVisible();

  // Open the imported schedule
  await page.getByRole('link', { name: 'North Plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'North Plant' })).toBeVisible();

  const statusBar = page.getByRole('region', { name: 'Schedule status' });
  await expect(statusBar).toContainText('As imported');

  // Enter Edit mode
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

  // Open Details -> Relationships and add a link (A1010 -> A1030 SS)
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('tab', { name: 'Relationships' }).click();
  const predSection = page.getByRole('region', { name: 'Predecessors' });
  const predTable = predSection.getByRole('table');
  await predSection
    .getByLabel('Predecessor activity')
    .selectOption({ label: 'A1010 · Kazı işleri' });
  await predSection.getByLabel('Predecessor link type').selectOption('SS');
  await predSection.getByRole('button', { name: 'Add predecessor' }).click();
  await expect(predTable).toContainText('Kazı işleri');

  // Verify stale banner appears
  await expect(page.getByRole('toolbar', { name: 'Schedule toolbar' })).toContainText(
    'Recalculate needed',
  );

  // Calculate via F5
  await page.keyboard.press('F5');
  await expect(statusBar).toContainText('Calculated (P6)');
  await expect(statusBar).toContainText('Calculated in');

  // Toggle Critical path and Driving path
  const critBtn = page.getByRole('button', { name: 'Critical path' });
  await critBtn.click();
  await expect(critBtn).toHaveAttribute('aria-pressed', 'false');
  await critBtn.click();
  await expect(critBtn).toHaveAttribute('aria-pressed', 'true');

  const drivingBtn = page.getByRole('button', { name: 'Driving path' });
  await drivingBtn.click();
  await expect(drivingBtn).toHaveAttribute('aria-pressed', 'true');
  await drivingBtn.click();
  await expect(drivingBtn).toHaveAttribute('aria-pressed', 'false');

  // Undo (Ctrl+Z) & Redo (Ctrl+Shift+Z)
  await page.keyboard.press('Control+z');
  await expect(predTable).not.toContainText('Kazı işleri');
  await page.keyboard.press('Control+Shift+Z');
  await expect(predTable).toContainText('Kazı işleri');

  // Recalculate after redo so saved snapshot is Calculated (P6)
  await page.keyboard.press('F5');
  await expect(statusBar).toContainText('Calculated (P6)');

  // Save via Ctrl+S and reload
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toContainText('Schedule saved');

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
});

test('detects circular logic on Calculate, jumps to cycle activity, and clears alert once broken', async ({
  page,
}) => {
  await openProject(page, 'Harbor Logistics Hub');
  await page.getByRole('link', { name: 'Open current schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Update 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();

  // Select A1010 ("Site mobilization") and add A1040 as predecessor (A1010 -> A1020 -> A1040 -> A1010 loop)
  const a1010Row = page
    .getByRole('treegrid', { name: 'Schedule activities' })
    .getByRole('row')
    .filter({ hasText: 'Site mobilization' });
  await a1010Row.click();

  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('tab', { name: 'Relationships' }).click();
  const predSection = page.getByRole('region', { name: 'Predecessors' });
  await predSection
    .getByLabel('Predecessor activity')
    .selectOption({ label: 'A1040 · Foundation concrete pour' });
  await predSection.getByRole('button', { name: 'Add predecessor' }).click();

  await page.keyboard.press('F5');
  const alert = page.getByRole('alert').filter({ hasText: 'Circular logic found:' });
  await expect(alert).toBeVisible();

  // Click A1010 in the cycle banner, remove the cycle-closing link, recalculate
  await alert.getByRole('button', { name: 'A1010' }).first().click();
  await predSection.getByRole('button', { name: 'Remove link with A1040' }).click();

  await page.keyboard.press('F5');
  await expect(alert).toHaveCount(0);
});

test('authors a blank schedule from scratch with WBS, activities, link, Calculate and Save across reload', async ({
  page,
}) => {
  await openProject(page, 'Riverside Office Tower');
  await page.getByRole('link', { name: 'Open current schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Main schedule' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: '+ WBS' }).click();
  await page.getByRole('button', { name: '+ Activity' }).click();
  await page.getByRole('button', { name: '+ Activity' }).click();

  // Link A1010 -> A1020 via inline Predecessors cell
  const grid = page.getByRole('treegrid', { name: 'Schedule activities' });
  const a1020Row = grid.getByRole('row').filter({ hasText: 'A1020' });
  await a1020Row.getByRole('gridcell').nth(8).dblclick();
  const predInput = page.getByRole('textbox', { name: 'Edit predecessors for A1020' });
  await predInput.fill('A1010');
  await predInput.press('Enter');

  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByRole('region', { name: 'Schedule status' })).toContainText(
    'Calculated in',
  );

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('Schedule saved');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Main schedule' })).toBeVisible();
  await expect(grid).toContainText('A1010');
  await expect(grid).toContainText('A1020');
});

test('supports Ctrl+F search, match counter and ancestor-preserving Filter', async ({ page }) => {
  await openProject(page, 'Harbor Logistics Hub');
  await page.getByRole('link', { name: 'Open current schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Update 2' })).toBeVisible();

  await page.keyboard.press('Control+f');
  const search = page.getByRole('searchbox', { name: 'Search activities' });
  await expect(search).toBeFocused();

  await search.fill('A1030');
  await expect(page.getByText('1 of 1')).toBeVisible();

  await page.getByRole('button', { name: 'Filter' }).click();
  const grid = page.getByRole('treegrid', { name: 'Schedule activities' });
  await expect(grid).toContainText('Construction works');
  await expect(grid).toContainText('Substructure');
  await expect(grid).toContainText('A1030');
  await expect(grid).not.toContainText('A1040');
});

test('shows Archived · read-only badge and hides Edit on an archived schedule', async ({
  page,
}) => {
  await openProject(page, 'Campus Library Retrofit');
  await page.getByRole('checkbox', { name: 'Show archived' }).check();
  await page.getByRole('link', { name: 'Recovery plan draft' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Recovery plan draft' })).toBeVisible();
  await expect(page.getByText('Archived · read-only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('supports Ctrl+K command palette activity jump and Gantt canvas bar resize & link drawing with Undo', async ({
  page,
}) => {
  await openProject(page, 'Riverside Office Tower');
  await page.getByRole('link', { name: 'Open current schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Main schedule' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: '+ Activity' }).click();
  await page.getByRole('button', { name: '+ Activity' }).click();
  await page.getByRole('button', { name: 'Calculate' }).click();

  const grid = page.getByRole('treegrid', { name: 'Schedule activities' });
  const a1010Row = grid.getByRole('row').filter({ hasText: 'A1010' });
  const a1020Row = grid.getByRole('row').filter({ hasText: 'A1020' });
  await expect(a1010Row).toContainText('5 d');

  // Use Ctrl+K command palette to jump to A1020
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  const paletteInput = dialog.getByPlaceholder('Search activities, WBS or commands…');
  await paletteInput.fill('A1020');
  await dialog.getByRole('option', { name: /A1020/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect(a1020Row).toHaveAttribute('aria-selected', 'true');

  // Use Zoom to fit to switch to Day zoom (32px/day) and drag A1010 right resize handle (+96px = +3 days -> 8 d)
  await page.getByRole('button', { name: 'Zoom to fit' }).click();
  await expect(page.getByRole('combobox', { name: 'Zoom level' })).toContainText('Day');
  const canvas = page.getByLabel('Gantt chart', { exact: true });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 212, box.y + 16);
  await expect(canvas).toHaveCSS('cursor', 'ew-resize');
  await page.mouse.down();
  await page.mouse.move(box.x + 308, box.y + 16, { steps: 5 });
  await page.mouse.up();
  await expect(a1010Row).toContainText('8 d');

  // Undo resize back to 5 d, then draw a finish-to-start link from A1010 finish port to A1020 start port
  await page.keyboard.press('Control+z');
  await expect(a1010Row).toContainText('5 d');

  await page.mouse.move(box.x + 223, box.y + 16);
  await expect(canvas).toHaveCSS('cursor', 'crosshair');
  await page.mouse.down();
  await page.mouse.move(box.x + 67, box.y + 48, { steps: 5 });
  await page.mouse.up();
  await expect(a1020Row).toContainText('A1010');

  // Undo link creation via Ctrl+Z
  await page.keyboard.press('Control+z');
  await expect(a1020Row).not.toContainText('A1010');
});
