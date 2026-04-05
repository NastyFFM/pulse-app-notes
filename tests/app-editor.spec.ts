import { test, expect } from '@playwright/test';

const APP_URL = '/app/app-editor/';

test.describe('App Editor', () => {

  test('1 - App laedt: Header sichtbar, 4 Tab-Buttons vorhanden', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Header is visible
    const header = page.locator('#header');
    await expect(header).toBeVisible();

    // h1 title
    const title = page.locator('#header h1');
    await expect(title).toBeVisible();
    await expect(title).toContainText('App Editor');

    // 4 tab buttons with correct labels
    const tabBtns = page.locator('.tab-btn');
    await expect(tabBtns).toHaveCount(4);

    await expect(tabBtns.filter({ hasText: 'Build Monitor' })).toBeVisible();
    await expect(tabBtns.filter({ hasText: 'Agent Graph' })).toBeVisible();
    await expect(tabBtns.filter({ hasText: 'Kanban' })).toBeVisible();
    await expect(tabBtns.filter({ hasText: 'Files' })).toBeVisible();
  });

  test('2 - Tab-Switching: Klick auf jeden Tab zeigt den richtigen Content', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Build Monitor is active by default
    await expect(page.locator('#tab-monitor')).toHaveClass(/active/);
    await expect(page.locator('#tab-graph')).not.toHaveClass(/active/);
    await expect(page.locator('#tab-kanban')).not.toHaveClass(/active/);
    await expect(page.locator('#tab-files')).not.toHaveClass(/active/);

    // Click Agent Graph tab
    await page.locator('.tab-btn[data-tab="graph"]').click();
    await expect(page.locator('#tab-graph')).toHaveClass(/active/);
    await expect(page.locator('#tab-monitor')).not.toHaveClass(/active/);

    // Click Kanban tab
    await page.locator('.tab-btn[data-tab="kanban"]').click();
    await expect(page.locator('#tab-kanban')).toHaveClass(/active/);
    await expect(page.locator('#tab-graph')).not.toHaveClass(/active/);

    // Click Files tab
    await page.locator('.tab-btn[data-tab="files"]').click();
    await expect(page.locator('#tab-files')).toHaveClass(/active/);
    await expect(page.locator('#tab-kanban')).not.toHaveClass(/active/);

    // Click back to Build Monitor
    await page.locator('.tab-btn[data-tab="monitor"]').click();
    await expect(page.locator('#tab-monitor')).toHaveClass(/active/);
    await expect(page.locator('#tab-files')).not.toHaveClass(/active/);
  });

  test('3 - Build Monitor: Stats-Bar sichtbar, Worker-Container existiert', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Stats bar in header
    const statsBar = page.locator('#stats-bar');
    await expect(statsBar).toBeVisible();

    // Individual stat counters
    await expect(page.locator('#stat-running')).toBeVisible();
    await expect(page.locator('#stat-done')).toBeVisible();
    await expect(page.locator('#stat-error')).toBeVisible();

    // Workers container exists inside the monitor tab
    const workersList = page.locator('#workers-list');
    await expect(workersList).toBeVisible();

    // Log stream exists
    const logStream = page.locator('#log-stream');
    await expect(logStream).toBeVisible();
  });

  test('4 - Agent Graph: SVG mit Orchestrator-Knoten sichtbar', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Switch to Agent Graph tab
    await page.locator('.tab-btn[data-tab="graph"]').click();

    // SVG element is present
    const svg = page.locator('#agent-graph-svg');
    await expect(svg).toBeVisible();

    // Orchestrator node exists inside the SVG
    const orchestratorNode = page.locator('#node-orchestrator');
    await expect(orchestratorNode).toBeAttached();

    // Orchestrator text label
    const orchestratorText = page.locator('#node-orchestrator text').filter({ hasText: 'Orchestrator' });
    await expect(orchestratorText).toBeAttached();

    // Graph legend visible
    await expect(page.locator('#graph-legend')).toBeVisible();

    // Graph status text visible
    await expect(page.locator('#graph-status')).toBeVisible();
  });

  test('5 - Kanban: 4 Spalten sichtbar (Backlog, In Progress, Review, Done)', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(1000);

    // Switch to Kanban tab
    await page.locator('.tab-btn[data-tab="kanban"]').click();

    // Kanban board container
    const board = page.locator('#kanban-board');
    await expect(board).toBeVisible();

    // All 4 columns
    const columns = page.locator('.kanban-col');
    await expect(columns).toHaveCount(4);

    // Column titles by text content
    await expect(page.locator('.col-backlog .kanban-col-title')).toContainText('Backlog');
    await expect(page.locator('.col-inprogress .kanban-col-title')).toContainText('In Progress');
    await expect(page.locator('.col-review .kanban-col-title')).toContainText('Review');
    await expect(page.locator('.col-done .kanban-col-title')).toContainText('Done');

    // Count badges present for each column
    await expect(page.locator('#count-backlog')).toBeAttached();
    await expect(page.locator('#count-inprogress')).toBeAttached();
    await expect(page.locator('#count-review')).toBeAttached();
    await expect(page.locator('#count-done')).toBeAttached();
  });

});
