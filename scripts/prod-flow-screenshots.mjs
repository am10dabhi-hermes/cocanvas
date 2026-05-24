#!/usr/bin/env node
/**
 * Drive the production-built Roughdraft server through a real-user HTML
 * review flow with a headless Chromium browser. Saves screenshots under
 * .context/ui-state-screenshots/final-production-flow/ and asserts no
 * console errors fire during the flow.
 *
 * The production server must be running at PROD_URL (default
 * http://localhost:7375) with PROJECT_DIR set to the directory that contains
 * the scratch HTML file at SCRATCH_FILE.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baseUrl = process.env.PROD_URL ?? "http://localhost:7375";
const projectDir = process.env.PROJECT_DIR ?? "/tmp/roughdraft-prod-test";
const scratchFile =
  process.env.SCRATCH_FILE ?? path.join(projectDir, "scratch.html");
const outDir = path.join(
  repoRoot,
  ".context",
  "ui-state-screenshots",
  "final-production-flow",
);
fs.mkdirSync(outDir, { recursive: true });

// Use a fixture that exercises both authoring and suggestion accept/reject in
// the browser. This mirrors the e2e fixture from html-authoring.spec.ts and is
// reset on every run so the test is deterministic.
const SCRATCH_FIXTURE = `<!doctype html>
<html lang="en">
  <head><title>Production flow fixture</title></head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>We expanded the team in Berlin and Bangalore.</p>
      <p>We shipped <ins data-rd-suggestion-id="s-ins" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:00:00Z" data-rd-status="open">three new</ins> features this week.</p>
      <p>We will replace <del data-rd-suggestion-id="s-sub" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:01:00Z" data-rd-status="open">the legacy parser</del><ins data-rd-suggestion-id="s-sub" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:01:00Z" data-rd-status="open">the new streaming parser</ins> next sprint.</p>
    </article>
  </body>
</html>
`;
fs.writeFileSync(scratchFile, SCRATCH_FIXTURE);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("response", async (response) => {
  if (response.status() >= 400) {
    consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
  }
});
page.on("pageerror", (err) => pageErrors.push(err.message));

const url = `${baseUrl}/?path=${encodeURIComponent(scratchFile)}`;
console.log("Opening", url);
async function waitForWorkspaceLoaded() {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="html-document-workspace"]',
      );
      return el && el.getAttribute("data-state") === "loaded";
    },
    { timeout: 15_000 },
  );
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await waitForWorkspaceLoaded();
await page.screenshot({
  path: path.join(outDir, "01-html-doc-loaded.png"),
  fullPage: true,
});

// Capture mobile viewport snapshot of the loaded doc.
const mobilePage = await context.newPage();
mobilePage.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`mobile: ${msg.text()}`);
});
await mobilePage.setViewportSize({ width: 414, height: 896 });
await mobilePage.goto(url, { waitUntil: "domcontentloaded" });
await mobilePage
  .waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="html-document-workspace"]',
      );
      return el && el.getAttribute("data-state") === "loaded";
    },
    { timeout: 15_000 },
  )
  .catch(() => {});
await mobilePage.screenshot({
  path: path.join(outDir, "02-html-doc-mobile.png"),
  fullPage: true,
});
await mobilePage.close();

// --- Step A: Add a comment via the UI ---
await page.evaluate((targetText) => {
  const root = document.querySelector('[data-testid="html-readonly-view"]');
  if (!root) throw new Error("Could not find HTML readonly view");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const index = node.textContent?.indexOf(targetText) ?? -1;
    if (index >= 0) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + targetText.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      return;
    }
    node = walker.nextNode();
  }
  throw new Error(`Could not find text "${targetText}"`);
}, "Berlin and Bangalore");

await page.getByTestId("html-add-comment-button").click();
await page.getByTestId("add-comment-composer").waitFor({ state: "visible" });
await page
  .getByTestId("add-comment-body")
  .fill("Split by office in the next report.");
await page.screenshot({
  path: path.join(outDir, "03-add-comment-composer.png"),
  fullPage: true,
});
await page.getByTestId("add-comment-save").click();
await page.waitForFunction(
  () => {
    return (
      document.querySelectorAll('[data-testid="html-review-card"]').length >= 1
    );
  },
  { timeout: 10_000 },
);
await page.screenshot({
  path: path.join(outDir, "04-comment-added.png"),
  fullPage: true,
});

// --- Step B: Accept the substitution suggestion ---
const acceptBtn = page.locator('[data-testid="suggestion-accept"]').first();
await acceptBtn.click();
await page
  .waitForFunction(
    () =>
      (!document.body.innerHTML.includes('data-rd-suggestion-id="s-sub"') &&
        !document.body.innerHTML.includes('data-rd-suggestion-id="s-ins"')) ||
      document.querySelectorAll('[data-testid="suggestion-accept"]').length <
        document.querySelectorAll('[data-testid="suggestion-reject"]').length +
          1,
    { timeout: 10_000 },
  )
  .catch(() => {});
await page.screenshot({
  path: path.join(outDir, "05-after-accept.png"),
  fullPage: true,
});

// --- Step C: Reject remaining suggestion ---
const rejectBtn = page.locator('[data-testid="suggestion-reject"]').first();
if (await rejectBtn.count()) {
  await rejectBtn.click();
  await page.waitForTimeout(500);
}
await page.screenshot({
  path: path.join(outDir, "06-after-reject.png"),
  fullPage: true,
});

// --- Step D: Reload and verify disk persistence ---
const afterActionsDisk = fs.readFileSync(scratchFile, "utf8");
fs.writeFileSync(
  path.join(outDir, "00-scratch-html-after-actions.html"),
  afterActionsDisk,
);

const diskAssertions = [
  {
    name: "comment anchor persisted",
    ok:
      afterActionsDisk.includes("data-rd-comment-ids") &&
      afterActionsDisk.includes("Split by office in the next report."),
  },
  {
    name: "accepted substitution persisted",
    ok:
      afterActionsDisk.includes("the new streaming parser") &&
      !afterActionsDisk.includes('data-rd-suggestion-id="s-sub"'),
  },
  {
    name: "rejected insertion removed",
    ok:
      !afterActionsDisk.includes('data-rd-suggestion-id="s-ins"') &&
      !afterActionsDisk.includes("three new"),
  },
];

await page.goto(url, { waitUntil: "domcontentloaded" });
await waitForWorkspaceLoaded();
await page.screenshot({
  path: path.join(outDir, "07-after-reload.png"),
  fullPage: true,
});

const beforeBytes = SCRATCH_FIXTURE.length;

const summary = {
  baseUrl,
  scratchFile,
  beforeBytes,
  afterBytes: afterActionsDisk.length,
  diskAssertions,
  consoleErrors,
  pageErrors,
  capturedAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(outDir, "summary.json"),
  JSON.stringify(summary, null, 2),
);

await context.close();
await browser.close();

console.log("Screenshots written to", outDir);
console.log("Console errors:", consoleErrors.length);
console.log("Page errors:", pageErrors.length);
const failedDiskAssertions = diskAssertions.filter(
  (assertion) => !assertion.ok,
);
console.log(
  "Disk assertions:",
  `${diskAssertions.length - failedDiskAssertions.length}/${diskAssertions.length}`,
);
if (
  consoleErrors.length > 0 ||
  pageErrors.length > 0 ||
  failedDiskAssertions.length > 0
) {
  console.error("Console errors:", consoleErrors);
  console.error("Page errors:", pageErrors);
  console.error("Failed disk assertions:", failedDiskAssertions);
  process.exit(1);
}
