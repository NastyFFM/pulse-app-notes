import { test, expect } from '@playwright/test';

const APP_URL = '/app/pulsetv/';

test.describe('PulseTV', () => {

  test('App laedt und zeigt Navbar und Hero-Banner', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Navbar mit Logo sichtbar
    await expect(page.locator('.navbar-logo')).toBeVisible();
    await expect(page.locator('.navbar-logo')).toContainText('PulseTV');

    // Navbar-Tabs vorhanden
    await expect(page.locator('.navbar-tab', { hasText: 'Home' })).toBeVisible();
    await expect(page.locator('.navbar-tab', { hasText: 'Watchlist' })).toBeVisible();

    // Home-Tab ist aktiv
    await expect(page.locator('#tab-home')).toHaveClass(/active/);

    // Hero-Banner sichtbar
    await expect(page.locator('.hero')).toBeVisible();

    // Hero-Inhalt ist befuellt (Titel sichtbar)
    await expect(page.locator('.hero-title')).toBeVisible();

    // Hero-Aktions-Buttons vorhanden
    await expect(page.locator('.btn-play')).toBeVisible();
    await expect(page.locator('.btn-info')).toBeVisible();

    // Hero-Dots Navigation sichtbar
    await expect(page.locator('.hero-dots')).toBeVisible();
    const dots = page.locator('.hero-dot');
    await expect(dots).toHaveCount(3); // 3 FEATURED videos
  });

  test('Kategorie-Reihen sind sichtbar — mindestens 3 Sections mit Video-Karten', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Home-Inhalt geladen
    await expect(page.locator('#homeContent')).toBeVisible();

    // Mindestens 3 Sektionen sichtbar
    const sections = page.locator('#homeContent .section');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Jede Sektion hat einen Titel und Karten
    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(sections.nth(i).locator('.section-title')).toBeVisible();
      const cards = sections.nth(i).locator('.video-card');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(1);
    }

    // Mindestens eine Karte mit Titel vorhanden
    await expect(page.locator('.video-card .card-title').first()).toBeVisible();
  });

  test('Suche oeffnet Overlay und filtert Videos', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Suchoverlay ist anfangs geschlossen
    await expect(page.locator('#searchOverlay')).not.toHaveClass(/open/);

    // Such-Button klicken
    await page.locator('#searchToggle').click();
    await page.waitForTimeout(300);

    // Suchoverlay ist jetzt offen
    await expect(page.locator('#searchOverlay')).toHaveClass(/open/);
    await expect(page.locator('#searchInput')).toBeVisible();

    // Suchbegriff eingeben — "Despacito" ist im Datensatz
    await page.locator('#searchInput').fill('Despacito');
    await page.waitForTimeout(300);

    // Suchergebnisse erscheinen
    const results = page.locator('.search-result-item');
    const resultCount = await results.count();
    expect(resultCount).toBeGreaterThanOrEqual(1);

    // Erstes Ergebnis enthaelt den Suchbegriff
    await expect(results.first()).toContainText('Despacito');

    // Suche schliessen via X-Button
    await page.locator('#searchClose').click();
    await page.waitForTimeout(300);

    // Overlay ist wieder geschlossen
    await expect(page.locator('#searchOverlay')).not.toHaveClass(/open/);
  });

  test('Video-Player Modal oeffnet sich bei Klick auf Video-Karte', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Player Modal ist anfangs geschlossen
    await expect(page.locator('#playerModal')).not.toHaveClass(/open/);

    // Auf erste Video-Karte in der ersten Sektion klicken
    const firstCard = page.locator('#homeContent .video-card').first();
    await expect(firstCard).toBeVisible();

    const cardTitle = await firstCard.locator('.card-title').textContent();
    await firstCard.click();
    await page.waitForTimeout(500);

    // Player Modal ist jetzt offen
    await expect(page.locator('#playerModal')).toHaveClass(/open/);

    // Player-Titel ist sichtbar und stimmt mit Karten-Titel ueberein
    await expect(page.locator('#playerTitle')).toBeVisible();
    await expect(page.locator('#playerTitle')).toContainText(cardTitle!.trim());

    // IFrame ist vorhanden und hat YouTube-URL als src
    const iframeSrc = await page.locator('#playerIframe').getAttribute('src');
    expect(iframeSrc).toContain('youtube.com/embed/');

    // Schliessen-Button sichtbar
    await expect(page.locator('#playerClose')).toBeVisible();

    // Watchlist-Button im Player sichtbar
    await expect(page.locator('#watchlistBtn')).toBeVisible();

    // Player schliessen
    await page.locator('#playerClose').click();
    await page.waitForTimeout(300);

    // Modal ist wieder geschlossen
    await expect(page.locator('#playerModal')).not.toHaveClass(/open/);
  });

  test('Watchlist: Video kann hinzugefuegt werden und erscheint im Watchlist-Tab', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Watchlist-Tab initial: leer oder mit wenigen Eintraegen
    // Direkt ueber Watchlist-Button im Player testen:

    // Erste Video-Karte klicken um Player zu oeffnen
    const firstCard = page.locator('#homeContent .video-card').first();
    const cardTitleEl = firstCard.locator('.card-title');
    const videoTitle = await cardTitleEl.textContent();
    await firstCard.click();
    await page.waitForTimeout(500);

    // Player ist offen
    await expect(page.locator('#playerModal')).toHaveClass(/open/);

    // Aktuellen Watchlist-Status des Buttons erfassen
    const wBtn = page.locator('#watchlistBtn');
    const initialText = await wBtn.textContent();

    // Wenn noch nicht in Watchlist, hinzufuegen
    if (!initialText?.includes('In Watchlist')) {
      await wBtn.click();
      await page.waitForTimeout(300);

      // Button zeigt jetzt "In Watchlist"
      await expect(wBtn).toContainText('In Watchlist');
      await expect(wBtn).toHaveClass(/active/);
    }

    // Player schliessen
    await page.locator('#playerClose').click();
    await page.waitForTimeout(300);

    // Auf Watchlist-Tab wechseln
    await page.locator('.navbar-tab', { hasText: 'Watchlist' }).click();
    await page.waitForTimeout(500);

    // Watchlist-Tab ist aktiv
    await expect(page.locator('#tab-watchlist')).toHaveClass(/active/);

    // Watchlist-Inhalt zeigt mindestens ein Video
    const watchlistCards = page.locator('#watchlistContent .video-card');
    const wCount = await watchlistCards.count();
    expect(wCount).toBeGreaterThanOrEqual(1);

    // Das hinzugefuegte Video ist in der Watchlist sichtbar
    await expect(page.locator('#watchlistContent')).toContainText(videoTitle!.trim());

    // Zaehler zeigt korrekte Anzahl
    await expect(page.locator('#watchlistCount')).toContainText('Video');
  });

  test('Hero-Banner: Abspielen-Button oeffnet Player mit korrektem Video', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Hero-Titel merken
    const heroTitle = await page.locator('.hero-title').textContent();

    // Abspielen-Button im Hero klicken
    await page.locator('.btn-play').first().click();
    await page.waitForTimeout(500);

    // Player Modal ist offen
    await expect(page.locator('#playerModal')).toHaveClass(/open/);

    // Player-Titel stimmt mit Hero-Titel ueberein
    await expect(page.locator('#playerTitle')).toContainText(heroTitle!.trim());

    // IFrame enthaelt YouTube-URL
    const iframeSrc = await page.locator('#playerIframe').getAttribute('src');
    expect(iframeSrc).toContain('youtube.com/embed/');
    expect(iframeSrc).toContain('autoplay=1');

    // Player mit Escape schliessen
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Modal ist wieder geschlossen
    await expect(page.locator('#playerModal')).not.toHaveClass(/open/);
  });

});
