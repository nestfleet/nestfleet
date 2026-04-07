/**
 * Captures screenshots of the richest case detail page for landing page use.
 *
 * Usage: npx playwright test scripts/capture-lineage.ts
 * Output: console/public/lineage-*.png
 */
import { test } from "@playwright/test";

const BASE = "http://localhost:3002";
const CASE_ID = "case_01kkyb7ksbhmttqvsd4nreb4b0";
const OUTPUT_DIR = "public";

test("capture lineage views", async ({ page }) => {
  // Login
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "admin@nestfleet.local");
  await page.fill('input[type="password"]', "nestfleet-admin-2025");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/cases**", { timeout: 10_000 });

  // Navigate to case detail
  await page.goto(`${BASE}/cases/${CASE_ID}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000); // Let animations settle

  // Screenshot 1: Full case detail (timeline view) — full page to capture all nodes
  await page.screenshot({
    path: `${OUTPUT_DIR}/lineage-timeline.png`,
    fullPage: true,
  });

  // Screenshot 2: Graph view — click the graph toggle button (second button in the toggle group)
  // The toggle group has two buttons: list view (active) and graph view
  const toggleButtons = page.locator('button svg').locator('..').filter({ has: page.locator('svg') });
  // More specific: look for the toggle group near "Case Lineage"
  const graphBtn = page.locator('button').filter({ has: page.locator('path[d*="M13.5 4.5L21"]') }).first();
  if (await graphBtn.count() === 0) {
    // Fallback: find all small toggle buttons and click the second one
    const allToggles = page.locator('button.rounded-lg, button.rounded-md').filter({ has: page.locator('svg') });
    const count = await allToggles.count();
    // The graph toggle is the one with the graph/flow icon — typically the last toggle in the group
    for (let i = 0; i < count; i++) {
      const btn = allToggles.nth(i);
      const cls = await btn.getAttribute('class') ?? '';
      if (cls.includes('bg-white') || cls.includes('text-gray')) {
        // This is likely the inactive toggle (graph view)
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    }
  } else {
    await graphBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({
    path: `${OUTPUT_DIR}/lineage-graph.png`,
    fullPage: true,
  });

  // Screenshot 3: Viewport-only graph view (what fits on screen — better for landing page)
  await page.screenshot({
    path: `${OUTPUT_DIR}/lineage-graph-viewport.png`,
    fullPage: false,
  });

  console.log("Screenshots saved to public/lineage-*.png");
});
