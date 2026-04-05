import { test, expect } from '@playwright/test';

const APP_URL = '/app/pomo-timer/';

test.describe('Pomo Timer', () => {

  test('App lädt korrekt — Titel, Timer-Anzeige, Buttons sichtbar', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Titel in der App
    const headerTitle = page.locator('.header-title');
    await expect(headerTitle).toBeVisible();
    await expect(headerTitle).toHaveText('Pomo Timer');

    // Timer-Anzeige
    const timerDisplay = page.locator('#timerDisplay');
    await expect(timerDisplay).toBeVisible();

    // Start-Button
    const startBtn = page.locator('#startBtn');
    await expect(startBtn).toBeVisible();

    // Reset-Button
    const resetBtn = page.locator('#resetBtn');
    await expect(resetBtn).toBeVisible();
  });

  test('Timer-Anzeige zeigt korrektes Format (MM:SS)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    const timerText = await page.locator('#timerDisplay').textContent();
    // Must match MM:SS format
    expect(timerText).toMatch(/^\d{2}:\d{2}$/);
  });

  test('Start-Button startet den Timer — Zeit zählt runter', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Capture time before starting
    const timeBefore = await page.locator('#timerDisplay').textContent();

    await page.locator('#startBtn').click();
    // Button should now read PAUSE
    await expect(page.locator('#startBtn')).toHaveText('PAUSE');

    // Wait 2.5 seconds for at least one tick
    await page.waitForTimeout(2500);

    const timeAfter = await page.locator('#timerDisplay').textContent();

    // Time must have changed
    expect(timeAfter).not.toBe(timeBefore);
  });

  test('Pause-Button pausiert — Zeit bleibt stehen', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Start the timer
    await page.locator('#startBtn').click();
    await page.waitForTimeout(1500);

    // Pause it
    await page.locator('#startBtn').click();
    await expect(page.locator('#startBtn')).toHaveText('WEITER');

    const timeAfterPause = await page.locator('#timerDisplay').textContent();

    // Wait 2 seconds — time should NOT change while paused
    await page.waitForTimeout(2000);

    const timeAfterWait = await page.locator('#timerDisplay').textContent();
    expect(timeAfterWait).toBe(timeAfterPause);
  });

  test('Reset-Button setzt zurück auf 25:00', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Start the timer so the time ticks down
    await page.locator('#startBtn').click();
    await page.waitForTimeout(2500);

    // Click reset
    await page.locator('#resetBtn').click();
    await page.waitForTimeout(300);

    const timerText = await page.locator('#timerDisplay').textContent();
    expect(timerText).toBe('25:00');

    // Start button label should be back to START
    await expect(page.locator('#startBtn')).toHaveText('START');
  });

  test('Session-Dots sind sichtbar (4 Stück)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // All four dot elements must exist
    for (let i = 0; i < 4; i++) {
      const dot = page.locator(`#dot${i}`);
      await expect(dot).toBeAttached();
    }

    // The container itself should be visible
    await expect(page.locator('#sessionDots')).toBeVisible();
  });

  test('SVG-Fortschrittskreis existiert', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // The SVG element
    const svg = page.locator('#timerSvg');
    await expect(svg).toBeVisible();

    // The progress circle
    const progressCircle = page.locator('#circleProgress');
    await expect(progressCircle).toBeAttached();

    // stroke-dasharray should be set (CIRCUMFERENCE ≈ 716.28)
    const dashArray = await progressCircle.evaluate(
      (el) => window.getComputedStyle(el).strokeDasharray
    );
    expect(dashArray).toBeTruthy();
    expect(dashArray).not.toBe('none');
  });

});
