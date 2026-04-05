import { test, expect } from '@playwright/test';

const APP_URL = '/app/habit-tracker/';

test.describe('Habit Tracker', () => {

  test('App lädt — Header und Eingabefeld sichtbar', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    await expect(page.locator('.header')).toBeVisible();
    await expect(page.locator('.add-input')).toBeVisible();
    await expect(page.locator('.add-btn')).toBeVisible();
    await expect(page.locator('.progress-wrap')).toBeVisible();
  });

  test('Eingabefeld akzeptiert Text und Button wird enabled', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);

    const input = page.locator('.add-input');
    const btn = page.locator('.add-btn');

    // Button ist initial disabled
    await expect(btn).toBeDisabled();

    // Text eingeben
    await input.click();
    await input.type('Meditation');
    await expect(input).toHaveValue('Meditation');

    // Button sollte jetzt enabled sein
    await expect(btn).toBeEnabled();
  });

  test('Wochenübersicht sichtbar', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    await expect(page.locator('.week-section')).toBeVisible();
  });

  test('Fortschrittsbalken existiert', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    await expect(page.locator('.progress-bar-track')).toBeVisible();
    await expect(page.locator('.progress-label')).toBeVisible();
  });

  test('Emoji-Picker Button existiert', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    await expect(page.locator('.add-emoji-btn')).toBeVisible();
  });

});
