import { expect, test, type Page } from "@playwright/test";
import {
  createMarkdownProject,
  logE2eEvent,
  readProjectFile,
  removeMarkdownProject,
  writeProjectFile,
} from "./helpers";

const BASE_HTML = `<!doctype html>
<html lang="en">
  <head><title>HTML authoring fixture</title></head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>We expanded the team in Berlin and Bangalore.</p>
      <p>We shipped <ins data-rd-suggestion-id="s-ins" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:00:00Z" data-rd-status="open">three new</ins> features this week.</p>
      <p>We will replace <del data-rd-suggestion-id="s-sub" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:01:00Z" data-rd-status="open">the legacy parser</del><ins data-rd-suggestion-id="s-sub" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:01:00Z" data-rd-status="open">the new streaming parser</ins> next sprint.</p>
    </article>
  </body>
</html>`;

const ANCHORED_HTML = `<!doctype html>
<html lang="en">
  <head><title>HTML multi comment fixture</title></head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>We expanded the team in <mark data-rd-comment-ids="c-existing">Berlin and Bangalore</mark>.</p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-existing" data-rd-anchor-ids="c-existing" data-rd-status="open" data-rd-author="reviewer@example.com" data-rd-created-at="2026-05-23T12:00:00Z">Existing comment.</rd-comment>
    </aside>
  </body>
</html>`;

async function openHtmlFile(page: Page, absolutePath: string) {
  await page.goto(
    `/?${new URLSearchParams({ path: absolutePath }).toString()}`,
  );
  await expect(page.getByTestId("html-document-workspace")).toHaveAttribute(
    "data-state",
    "loaded",
  );
}

async function selectHtmlText(page: Page, text: string) {
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
  }, text);
}

test.describe("html authoring", () => {
  let projectDir: string;

  test.beforeEach(() => {
    projectDir = createMarkdownProject("html-authoring");
  });

  test.afterEach(() => {
    removeMarkdownProject(projectDir);
  });

  test("html add comment persists anchor and record after reload @smoke", async ({
    page,
  }, testInfo) => {
    const filePath = writeProjectFile(projectDir, "doc.html", BASE_HTML);
    await openHtmlFile(page, filePath);

    await selectHtmlText(page, "Berlin and Bangalore");
    await page.getByTestId("html-add-comment-button").click();
    await expect(page.getByTestId("add-comment-composer")).toBeVisible();
    await testInfo.attach("G5.1-01-composer-open.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page.getByTestId("add-comment-body").fill("Mention headcount delta.");
    await page.getByTestId("add-comment-save").click();

    await expect(page.getByTestId("add-comment-composer")).toHaveCount(0);
    await expect(page.getByTestId("html-review-rail")).toContainText(
      "Mention headcount delta.",
    );

    await page.reload();
    await expect(page.getByTestId("html-document-workspace")).toHaveAttribute(
      "data-state",
      "loaded",
    );
    await expect(page.getByTestId("html-review-rail")).toContainText(
      "Mention headcount delta.",
    );
    await expect(
      page.locator('[data-testid="comment-anchor"]').filter({
        hasText: "Berlin and Bangalore",
      }),
    ).toBeVisible();

    const disk = readProjectFile(projectDir, "doc.html");
    expect(disk).toContain("Mention headcount delta.");
    expect(disk).toContain("<mark data-rd-comment-ids=");
    expect(disk).toContain("<rd-comment");

    await testInfo.attach("G5.1-02-after-save.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    logE2eEvent("html-authoring.add-comment", { file: filePath });
  });

  test("html accept suggestion persists resolved inserted text after reload @smoke", async ({
    page,
  }, testInfo) => {
    const filePath = writeProjectFile(projectDir, "doc.html", BASE_HTML);
    await openHtmlFile(page, filePath);

    await expect(page.getByTestId("html-review-rail")).toContainText(
      "Insertion",
    );
    await testInfo.attach("G5.2-01-before-accept.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page
      .locator('[data-testid="suggestion-accept"][data-suggestion-id="s-ins"]')
      .click();
    await expect(
      page.locator(
        '[data-testid="suggestion-accept"][data-suggestion-id="s-ins"]',
      ),
    ).toHaveCount(0);
    await expect(page.getByTestId("html-readonly-view")).toContainText(
      "We shipped three new features this week.",
    );

    await page.reload();
    await expect(page.getByTestId("html-document-workspace")).toHaveAttribute(
      "data-state",
      "loaded",
    );
    await expect(page.getByTestId("html-readonly-view")).toContainText(
      "We shipped three new features this week.",
    );

    const disk = readProjectFile(projectDir, "doc.html");
    expect(disk).toContain("three new");
    expect(disk).not.toContain('data-rd-suggestion-id="s-ins"');

    await testInfo.attach("G5.2-02-after-accept.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    logE2eEvent("html-authoring.accept-suggestion", { file: filePath });
  });

  test("html reject suggestion restores deleted text after reload @smoke", async ({
    page,
  }, testInfo) => {
    const filePath = writeProjectFile(projectDir, "doc.html", BASE_HTML);
    await openHtmlFile(page, filePath);

    await expect(page.getByTestId("html-review-rail")).toContainText(
      "Substitution",
    );
    await testInfo.attach("G5.3-01-before-reject.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    await page
      .locator('[data-testid="suggestion-reject"][data-suggestion-id="s-sub"]')
      .click();
    await expect(
      page.locator(
        '[data-testid="suggestion-reject"][data-suggestion-id="s-sub"]',
      ),
    ).toHaveCount(0);
    await expect(page.getByTestId("html-readonly-view")).toContainText(
      "We will replace the legacy parser next sprint.",
    );

    await page.reload();
    await expect(page.getByTestId("html-document-workspace")).toHaveAttribute(
      "data-state",
      "loaded",
    );
    await expect(page.getByTestId("html-readonly-view")).toContainText(
      "We will replace the legacy parser next sprint.",
    );

    const disk = readProjectFile(projectDir, "doc.html");
    expect(disk).toContain("the legacy parser");
    expect(disk).not.toContain("the new streaming parser");
    expect(disk).not.toContain('data-rd-suggestion-id="s-sub"');

    await testInfo.attach("G5.3-02-after-reject.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    logE2eEvent("html-authoring.reject-suggestion", { file: filePath });
  });

  test("html multi-comment span shows both comments on one anchor @smoke", async ({
    page,
  }, testInfo) => {
    const filePath = writeProjectFile(projectDir, "doc.html", ANCHORED_HTML);
    await openHtmlFile(page, filePath);

    await selectHtmlText(page, "Berlin and Bangalore");
    await page.getByTestId("html-add-comment-button").click();
    await page.getByTestId("add-comment-body").fill("Second comment.");
    await page.getByTestId("add-comment-save").click();

    await expect(page.getByTestId("html-review-rail")).toContainText(
      "Existing comment.",
    );
    await expect(page.getByTestId("html-review-rail")).toContainText(
      "Second comment.",
    );

    const anchors = page.locator('[data-testid="comment-anchor"]');
    await expect(anchors).toHaveCount(1);
    await expect(anchors.first()).toHaveAttribute(
      "data-rd-comment-ids",
      /c-existing\s+c-/,
    );

    const disk = readProjectFile(projectDir, "doc.html");
    const markCount = (disk.match(/<mark\b/g) ?? []).length;
    expect(markCount).toBe(1);
    expect(disk).toContain("c-existing");
    expect(disk).toContain("Second comment.");

    await testInfo.attach("G5.4-01-two-comments-one-span.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    logE2eEvent("html-authoring.multi-comment-span", { file: filePath });
  });
});
