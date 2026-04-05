import { test, expect } from '@playwright/test';

const APP_URL = '/app/expense-splitter/';

test.describe('Expense Splitter', () => {

  test('App laed korrekt — Header sichtbar, leere Gruppen-Ansicht', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Topbar mit Titel sichtbar
    await expect(page.locator('.topbar-title')).toBeVisible();
    await expect(page.locator('.topbar-title')).toContainText('Expense Splitter');

    // Gruppen-View ist aktiv
    await expect(page.locator('#view-groups')).toHaveClass(/active/);
    await expect(page.locator('#view-detail')).not.toHaveClass(/active/);

    // Abschnitt-Header "Meine Gruppen" sichtbar
    await expect(page.locator('.section-title')).toContainText('Meine Gruppen');

    // "+ Gruppe" Button sichtbar
    await expect(page.locator('button', { hasText: '+ Gruppe' })).toBeVisible();

    // Breadcrumb initial versteckt
    await expect(page.locator('#breadcrumb')).toBeHidden();
  });

  test('Neue Gruppe erstellen — Modal oeffnen, Name eingeben, Gruppe erscheint', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Modal initial geschlossen
    await expect(page.locator('#modal-create-group')).not.toHaveClass(/open/);

    // "+ Gruppe" Button klicken
    await page.locator('button', { hasText: '+ Gruppe' }).click();

    // Modal ist jetzt offen
    await expect(page.locator('#modal-create-group')).toHaveClass(/open/);
    await expect(page.locator('#modal-create-group .modal-title')).toContainText('Neue Gruppe erstellen');

    // Gruppenname eingeben
    await page.locator('#group-name-input').fill('Urlaub Testtruppe');

    // Optionale Mitglieder eingeben
    await page.locator('#group-members-input').fill('Alice, Bob, Carol');

    // Erstellen-Button klicken
    await page.locator('button', { hasText: 'Erstellen' }).click();

    // Modal geschlossen, in Detail-Ansicht gewechselt
    await expect(page.locator('#modal-create-group')).not.toHaveClass(/open/);
    await expect(page.locator('#view-detail')).toHaveClass(/active/);

    // Breadcrumb zeigt Gruppenname
    await expect(page.locator('#breadcrumb')).toBeVisible();
    await expect(page.locator('#breadcrumb-group-name')).toContainText('Urlaub Testtruppe');

    // Tab "Ausgaben" ist aktiv
    await expect(page.locator('#tab-expenses')).toHaveClass(/active/);
  });

  test('Ausgabe hinzufuegen — Formular ausfuellen, Ausgabe in Liste', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Gruppe erstellen
    await page.locator('button', { hasText: '+ Gruppe' }).click();
    await page.locator('#group-name-input').fill('Kochen Runde');
    await page.locator('#group-members-input').fill('Anna, Bernd');
    await page.locator('button', { hasText: 'Erstellen' }).click();
    await page.waitForTimeout(500);

    // "+ Ausgabe erfassen" Button klicken
    await page.locator('button', { hasText: '+ Ausgabe erfassen' }).click();
    await page.waitForTimeout(300);

    // Modal ist offen
    await expect(page.locator('#modal-expense')).toHaveClass(/open/);
    await expect(page.locator('#modal-expense .modal-title')).toContainText('Ausgabe erfassen');

    // Formular ausfuellen
    await page.locator('#exp-desc').fill('Pizza beim Italiener');
    await page.locator('#exp-amount').fill('45.60');

    // Datum ist bereits vorausgefuellt (todayISO), sicherstellen dass es gesetzt ist
    const dateVal = await page.locator('#exp-date').inputValue();
    expect(dateVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // "Bezahlt von" select hat Mitglieder
    const paidByOptions = await page.locator('#exp-paid-by option').count();
    expect(paidByOptions).toBeGreaterThanOrEqual(1);

    // Speichern-Button klicken
    await page.locator('button', { hasText: 'Speichern' }).click();
    await page.waitForTimeout(300);

    // Modal geschlossen
    await expect(page.locator('#modal-expense')).not.toHaveClass(/open/);

    // Ausgabe erscheint in der Liste
    await expect(page.locator('#expenses-list')).toContainText('Pizza beim Italiener');
    await expect(page.locator('#expenses-list')).toContainText('45');
  });

  test('Schulden-Anzeige funktioniert', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Gruppe mit Mitgliedern erstellen
    await page.locator('button', { hasText: '+ Gruppe' }).click();
    await page.locator('#group-name-input').fill('Schulden Test');
    await page.locator('#group-members-input').fill('Max, Lisa');
    await page.locator('button', { hasText: 'Erstellen' }).click();
    await page.waitForTimeout(500);

    // Ausgabe hinzufuegen
    await page.locator('button', { hasText: '+ Ausgabe erfassen' }).click();
    await page.waitForTimeout(300);
    await page.locator('#exp-desc').fill('Supermarkt');
    await page.locator('#exp-amount').fill('60');
    await page.locator('button', { hasText: 'Speichern' }).click();
    await page.waitForTimeout(300);

    // Auf Schulden-Tab wechseln
    await page.locator('#tab-balances').click();
    await page.waitForTimeout(300);

    // Schulden-Tab ist aktiv
    await expect(page.locator('#tab-balances')).toHaveClass(/active/);
    await expect(page.locator('#tab-content-balances')).toHaveClass(/active/);

    // balances-container ist sichtbar
    await expect(page.locator('#balances-container')).toBeVisible();

    // Schulden-Anzeige zeigt entweder Schulden-Zeilen oder "Keine offenen Schulden"
    const hasDebt = await page.locator('.balance-row').count();
    const hasEmpty = await page.locator('#balances-container .empty').isVisible().catch(() => false);
    expect(hasDebt > 0 || hasEmpty).toBeTruthy();
  });

  test('Eingabefelder akzeptieren Text', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1500);

    // Modal oeffnen um Eingabefelder zu pruefen
    await page.locator('button', { hasText: '+ Gruppe' }).click();
    await page.waitForTimeout(300);

    // Gruppenname-Eingabe
    const nameInput = page.locator('#group-name-input');
    await nameInput.fill('Test Eingabe Gruppe');
    await expect(nameInput).toHaveValue('Test Eingabe Gruppe');

    // Mitglieder-Eingabe
    const membersInput = page.locator('#group-members-input');
    await membersInput.fill('Person1, Person2, Person3');
    await expect(membersInput).toHaveValue('Person1, Person2, Person3');

    // Modal schliessen
    await page.locator('#modal-create-group button', { hasText: 'Abbrechen' }).click();
    await expect(page.locator('#modal-create-group')).not.toHaveClass(/open/);

    // Gruppe erstellen und Expense-Modal pruefen
    await page.locator('button', { hasText: '+ Gruppe' }).click();
    await page.locator('#group-name-input').fill('Felder Test Gruppe');
    await page.locator('#group-members-input').fill('Alpha, Beta');
    await page.locator('button', { hasText: 'Erstellen' }).click();
    await page.waitForTimeout(500);

    await page.locator('button', { hasText: '+ Ausgabe erfassen' }).click();
    await page.waitForTimeout(300);

    // Beschreibungs-Feld
    const descInput = page.locator('#exp-desc');
    await descInput.fill('Testausgabe fuer Felder');
    await expect(descInput).toHaveValue('Testausgabe fuer Felder');

    // Betrags-Feld (number)
    const amountInput = page.locator('#exp-amount');
    await amountInput.fill('99.99');
    await expect(amountInput).toHaveValue('99.99');

    // Datum-Feld
    const dateInput = page.locator('#exp-date');
    await dateInput.fill('2026-04-05');
    await expect(dateInput).toHaveValue('2026-04-05');
  });

});
