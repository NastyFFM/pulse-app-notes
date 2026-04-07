import { test, expect } from '@playwright/test';

test.describe('City Adviser', () => {
  test('app loads via PulseOS', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=City Adviser')).toBeVisible();
  });

  test('city list renders with cities', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1500);
    await expect(page.locator('#cityList')).toContainText('Berlin');
    await expect(page.locator('#cityList')).toContainText('Paris');
    await expect(page.locator('#cityList')).toContainText('Tokyo');
  });

  test('selecting a city shows detail view', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1500);
    await page.locator('.city-item').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.city-detail.visible')).toBeVisible();
    await expect(page.locator('#cityHero')).toBeVisible();
  });

  test('tabs are visible after city selection', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1500);
    await page.locator('.city-item').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.tab-btn').first()).toBeVisible();
    // 4 tabs should exist
    const tabs = await page.locator('.tab-btn').count();
    expect(tabs).toBe(4);
  });

  test('clicking restaurant tab shows cards', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1500);
    await page.locator('.city-item').first().click();
    await page.waitForTimeout(500);
    await page.locator('.tab-btn:has-text("Restaurants")').click();
    await page.waitForTimeout(300);
    const cards = await page.locator('.card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test('search input is visible', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1000);
    await expect(page.locator('#searchInput')).toBeVisible();
  });

  test('search shows results', async ({ page }) => {
    await page.goto('/app/city-adviser');
    await page.waitForTimeout(1500);
    await page.locator('#searchInput').fill('Berlin');
    await page.waitForTimeout(400);
    await expect(page.locator('#searchResults.open')).toBeVisible();
    await expect(page.locator('#searchResults')).toContainText('Berlin');
  });

  // PulseOS data API tests — /app/<id>/api/<dataFile> reads data/<dataFile>.json
  test('API /app/city-adviser/api/cities returns cities data', async ({ request }) => {
    const res = await request.get('/app/city-adviser/api/cities');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // PulseOS returns the full JSON file: { cities: [...] }
    expect(data).toHaveProperty('cities');
    expect(Array.isArray(data.cities)).toBeTruthy();
    expect(data.cities.length).toBeGreaterThan(0);
    expect(data.cities[0]).toHaveProperty('name');
    expect(data.cities[0]).toHaveProperty('id');
    expect(data.cities[0]).toHaveProperty('sights');
  });

  test('API /app/city-adviser/api/state is readable', async ({ request }) => {
    const res = await request.get('/app/city-adviser/api/state');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('favorites');
    expect(data).toHaveProperty('activeTab');
  });

  test('cities data includes Berlin with sights', async ({ request }) => {
    const res = await request.get('/app/city-adviser/api/cities');
    const data = await res.json();
    const berlin = data.cities.find((c: any) => c.id === 'berlin');
    expect(berlin).toBeTruthy();
    expect(berlin.name).toBe('Berlin');
    expect(berlin.sights.length).toBeGreaterThan(0);
    expect(berlin.restaurants.length).toBeGreaterThan(0);
    expect(berlin.secrets.length).toBeGreaterThan(0);
  });
});
