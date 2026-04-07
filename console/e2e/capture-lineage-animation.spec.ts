/**
 * Captures an animated GIF of the case lineage feature:
 * 1. Timeline view (hold 3s)
 * 2. Scroll to show more nodes (hold 2s)
 * 3. Click graph toggle (hold 3s)
 * 4. Click "fit view" to zoom to fit all nodes (hold 3s)
 * 5. Zoom into center nodes for detail (hold 3s)
 * 6. Back to timeline (hold 2s)
 *
 * Each "hold" = multiple duplicate frames at 100cs delay = ~1s per frame
 */
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";

const BASE = "http://localhost:3002";
const CASE_ID = "case_01kkyb7ksbhmttqvsd4nreb4b0";
const FRAMES_DIR = "public/lineage-frames";
const OUTPUT_GIF = "public/lineage-animation.gif";

// Write N duplicate frames for a "hold" effect
async function holdFrames(page: import("@playwright/test").Page, prefix: string, count: number, frameCounter: { n: number }) {
  for (let i = 0; i < count; i++) {
    const num = String(frameCounter.n++).padStart(3, "0");
    await page.screenshot({ path: `${FRAMES_DIR}/frame-${num}-${prefix}.png` });
  }
}

test("capture lineage animation frames", async ({ page }) => {
  // Clean and ensure frames directory
  if (existsSync(FRAMES_DIR)) {
    for (const f of readdirSync(FRAMES_DIR)) {
      if (f.endsWith(".png")) unlinkSync(`${FRAMES_DIR}/${f}`);
    }
  } else {
    mkdirSync(FRAMES_DIR, { recursive: true });
  }

  const fc = { n: 1 };

  // Larger viewport for better graph visibility
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "admin@nestfleet.local");
  await page.fill('input[type="password"]', "nestfleet-admin-2025");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/cases**", { timeout: 10_000 });

  // Force timeline view
  await page.evaluate(() => localStorage.removeItem("nestfleet:lineage-view"));

  // Navigate to case detail
  await page.goto(`${BASE}/cases/${CASE_ID}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // ── Step 1: Timeline view (hold 3s = 3 frames) ────────────────────────
  await holdFrames(page, "timeline", 3, fc);

  // ── Step 2: Scroll down to show more lineage nodes (hold 2s) ──────────
  await page.evaluate(() => window.scrollBy(0, 250));
  await page.waitForTimeout(500);
  await holdFrames(page, "scrolled", 2, fc);

  // Scroll back
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // ── Step 3: Click graph toggle (hold 3s) ──────────────────────────────
  const graphToggle = page.locator('button[title="Graph view"]');
  await expect(graphToggle).toBeVisible();
  await graphToggle.click();
  await page.waitForTimeout(2500);

  // Scroll to center the graph
  await page.evaluate(() => {
    const el = document.querySelector('.react-flow');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    else window.scrollBy(0, 200);
  });
  await page.waitForTimeout(500);
  await holdFrames(page, "graph-wide", 3, fc);

  // ── Step 4: Click "fit view" button to auto-zoom all nodes ────────────
  // React Flow has zoom controls: +, -, fit, lock
  const fitButton = page.locator('.react-flow__controls button').nth(2); // fit-view is usually 3rd
  if (await fitButton.count() > 0) {
    await fitButton.click();
    await page.waitForTimeout(1000);
  }
  await holdFrames(page, "graph-fit", 3, fc);

  // ── Step 5: Zoom INTO the graph center for node detail ────────────────
  // Use mouse wheel zoom on the react-flow canvas
  const canvas = page.locator('.react-flow');
  if (await canvas.count() > 0) {
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      // Zoom in with scroll wheel (5 ticks)
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -150);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(500);

      // Pan to center the interesting nodes (drag slightly left)
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 200, cy, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
  }
  await holdFrames(page, "graph-zoomed", 4, fc);

  // ── Step 6: Back to timeline (hold 2s) ────────────────────────────────
  const timelineToggle = page.locator('button[title="Timeline view"]');
  await timelineToggle.click();
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await holdFrames(page, "back-timeline", 2, fc);

  console.log(`${fc.n - 1} frames saved to ${FRAMES_DIR}/`);

  // Assemble GIF — 100cs delay per frame = 1 second per frame
  try {
    execSync(
      `convert -delay 100 -loop 0 -resize 1280x ${FRAMES_DIR}/frame-*.png -layers OptimizePlus ${OUTPUT_GIF}`,
      { stdio: "pipe" }
    );
    const size = Math.round(require("fs").statSync(OUTPUT_GIF).size / 1024);
    console.log(`GIF assembled: ${OUTPUT_GIF} (${size}KB)`);
  } catch (err) {
    console.log("ImageMagick failed — frames saved for manual assembly");
    console.log(String(err));
  }
});
