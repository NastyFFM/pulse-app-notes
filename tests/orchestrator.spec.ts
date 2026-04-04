import { test, expect } from '@playwright/test';

test.describe('Orchestrator: quickCreateApp', () => {

  test('new app gets data-newapp=true on edit panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Click "+" tile
    const neuKachel = page.locator('#appGrid .app-item').first();
    await expect(neuKachel).toBeVisible({ timeout: 5000 });
    await neuKachel.click();

    // Fill name + Enter
    const modal = page.locator('#quickCreateModal');
    await expect(modal).toBeVisible({ timeout: 3000 });
    const input = page.locator('#quickAppName');
    await input.fill('OrcTest' + Date.now());
    await input.press('Enter');

    // Wait for app + editor to open
    await page.waitForTimeout(3000);

    // Check: edit panel with data-newapp="true" exists
    const panel = page.locator('[data-newapp="true"]').first();
    await expect(panel).toHaveAttribute('data-newapp', 'true', { timeout: 3000 });
  });

  test('dock "+" also sets data-newapp=true', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    const dockPlus = page.locator('.dock-item:has-text("Neu")').first();
    await dockPlus.click();

    const modal = page.locator('#quickCreateModal');
    await expect(modal).toBeVisible({ timeout: 3000 });
    const input = page.locator('#quickAppName');
    await input.fill('DockOrc' + Date.now());
    await input.press('Enter');

    await page.waitForTimeout(3000);

    const panel = page.locator('[data-newapp="true"]').first();
    await expect(panel).toHaveAttribute('data-newapp', 'true', { timeout: 3000 });
  });
});
