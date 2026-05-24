import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createMarkdownProject,
  logE2eEvent,
  removeMarkdownProject,
  writeProjectFile,
} from "./helpers";

const HTML_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>HTML review rail sync fixture</title>
  </head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>
        Revenue grew
        <mark data-rd-comment-ids="c-rev-1">12%</mark>
        quarter over quarter.
      </p>
      <p>
        We expanded the team in
        <mark data-rd-comment-ids="c-team-1">Berlin and Bangalore</mark>.
      </p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-rev-1" data-rd-anchor-ids="c-rev-1" data-rd-status="open"
        data-rd-author="reviewer@example.com"
        data-rd-created-at="2026-05-23T12:00:30Z"
      >Cite the exact source row.</rd-comment>
      <rd-comment id="c-team-1" data-rd-anchor-ids="c-team-1" data-rd-status="open"
        data-rd-author="ananth@cradlewise.com"
        data-rd-created-at="2026-05-23T12:02:00Z"
      >Mention headcount delta.</rd-comment>
    </aside>
  </body>
</html>`;

test.describe("html review rail sync", () => {
  let projectDir: string;

  test.beforeEach(() => {
    projectDir = createMarkdownProject("html-review-rail-sync");
  });

  test.afterEach(() => {
    removeMarkdownProject(projectDir);
  });

  test("renders, syncs rail and anchor click activation @smoke", async ({
    page,
  }, testInfo) => {
    const filePath = writeProjectFile(projectDir, "doc.html", HTML_FIXTURE);

    await page.goto(`/?${new URLSearchParams({ path: filePath }).toString()}`);

    const workspace = page.getByTestId("html-document-workspace");
    await expect(workspace).toHaveAttribute("data-state", "loaded");
    await expect(page.getByTestId("html-readonly-view")).toBeVisible();
    await expect(page.getByTestId("html-review-rail")).toBeVisible();

    await expect(page.getByTestId("html-readonly-view")).toContainText(
      "Quarterly review",
    );
    await expect(page.getByTestId("html-readonly-view")).toContainText(
      "Revenue grew",
    );

    const anchorRev = page.locator(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-rev-1"]',
    );
    const anchorTeam = page.locator(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-team-1"]',
    );
    await expect(anchorRev).toBeVisible();
    await expect(anchorTeam).toBeVisible();

    const reviewCards = page.getByTestId("html-review-card");
    const cardRev = reviewCards.nth(0);
    const cardTeam = reviewCards.nth(1);
    await expect(cardRev).toBeVisible();
    await expect(cardTeam).toBeVisible();

    await testInfo.attach("01-loaded.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    // Rail card → inline anchor sync
    await cardRev.click();
    await expect(cardRev).toHaveAttribute("data-active", "true");
    await expect(anchorRev).toHaveAttribute("data-active", "true");
    await expect(cardTeam).toHaveAttribute("data-active", "false");

    await testInfo.attach("02-rail-click.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    // Inline anchor → rail card sync
    await anchorTeam.click();
    await expect(anchorTeam).toHaveAttribute("data-active", "true");
    await expect(cardTeam).toHaveAttribute("data-active", "true");
    await expect(cardRev).toHaveAttribute("data-active", "false");

    await testInfo.attach("03-anchor-click.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    logE2eEvent("html-review-rail-sync.synced", {
      projectDir,
      file: path.basename(filePath),
    });
  });
});
