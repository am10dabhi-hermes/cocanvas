import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type HtmlElementNode,
  type HtmlNode,
  parseAnnotatedHtml,
} from "../../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../../.context/fixtures/html");

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

function findElements(
  nodes: HtmlNode[],
  predicate: (element: HtmlElementNode) => boolean,
): HtmlElementNode[] {
  const found: HtmlElementNode[] = [];
  const walk = (list: HtmlNode[]) => {
    for (const node of list) {
      if (node.type !== "element") continue;
      if (predicate(node)) found.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

describe("parseAnnotatedHtml — comment anchors and records", () => {
  it("pairs each anchor id with its comment record", () => {
    const html = readFixture("commented-document.html");
    const doc = parseAnnotatedHtml(html);

    const anchors = findElements(
      doc.blocks,
      (element) =>
        element.tag === "mark" &&
        Object.hasOwn(element.attrs, "data-rd-comment-ids"),
    );

    const anchorIds = anchors.flatMap((mark) =>
      (mark.attrs["data-rd-comment-ids"] ?? "")
        .split(/\s+/)
        .filter((id) => id.length > 0),
    );

    expect(anchorIds).toEqual(["c-7uG2", "c-9aB1", "c-3xY8"]);

    const commentIds = doc.comments.map((comment) => comment.id);
    expect(commentIds).toContain("c-7uG2");
    expect(commentIds).toContain("c-9aB1");
    expect(commentIds).toContain("c-3xY8");

    const primary = doc.comments.find((comment) => comment.id === "c-7uG2");
    expect(primary).toBeDefined();
    if (!primary) return;
    expect(primary.author).toBe("ananth@cradlewise.com");
    expect(primary.createdAt).toBe("2026-05-23T10:14:11Z");
    expect(primary.anchorIds).toEqual(["c-7uG2"]);
    expect(primary.status).toBe("open");
    expect(primary.replyTo).toBeNull();
    expect(primary.updatedAt).toBeNull();
    expect(primary.body).toContain("clear sky");
  });

  it("parses multi-id anchors and exposes them as one mark with N ids", () => {
    const html = readFixture("commented-document.html");
    const doc = parseAnnotatedHtml(html);

    const multiAnchors = findElements(
      doc.blocks,
      (element) =>
        element.tag === "mark" &&
        (element.attrs["data-rd-comment-ids"] ?? "")
          .split(/\s+/)
          .filter(Boolean).length > 1,
    );

    expect(multiAnchors).toHaveLength(1);
    const mark = multiAnchors[0];
    if (!mark) return;
    expect(mark.attrs["data-rd-comment-ids"]).toBe("c-9aB1 c-3xY8");

    const ids = (mark.attrs["data-rd-comment-ids"] ?? "")
      .split(/\s+/)
      .filter((id) => id.length > 0);
    expect(ids).toEqual(["c-9aB1", "c-3xY8"]);

    for (const id of ids) {
      expect(doc.comments.find((comment) => comment.id === id)).toBeDefined();
    }
  });

  it("parses reply threads via data-rd-reply-to", () => {
    const html = readFixture("commented-document.html");
    const doc = parseAnnotatedHtml(html);

    const reply = doc.comments.find((comment) => comment.id === "c-3xY8");
    expect(reply).toBeDefined();
    if (!reply) return;
    expect(reply.replyTo).toBe("c-9aB1");

    const parent = doc.comments.find((comment) => comment.id === "c-9aB1");
    expect(parent).toBeDefined();
    if (!parent) return;
    expect(parent.replyTo).toBeNull();
  });

  it("parses resolved records and exposes status", () => {
    const html = readFixture("commented-document.html");
    const doc = parseAnnotatedHtml(html);

    const resolved = doc.comments.find((comment) => comment.id === "c-4r5T");
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expect(resolved.status).toBe("resolved");
  });

  it("records orphan anchors as warnings, not exceptions", () => {
    const input = [
      "<p>",
      '  <mark data-rd-comment-ids="c-ghost">word</mark>',
      "</p>",
      '<aside class="rd-review" hidden></aside>',
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(doc.warnings.length).toBeGreaterThan(0);
    const warning = doc.warnings.find(
      (entry) => entry.code === "orphan-anchor",
    );
    expect(warning).toBeDefined();
    if (!warning) return;
    expect(warning.message).toContain("c-ghost");
  });

  it("records orphan records as warnings, not exceptions", () => {
    const input = [
      "<p>plain</p>",
      '<aside class="rd-review" hidden>',
      "  <rd-comment",
      '    id="c-stray"',
      '    data-rd-author="someone@example.com"',
      '    data-rd-created-at="2026-05-23T10:14:11Z"',
      '    data-rd-anchor-ids=""',
      '    data-rd-status="open"',
      "  >No anchor for this one.</rd-comment>",
      "</aside>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    const stray = doc.comments.find((comment) => comment.id === "c-stray");
    expect(stray).toBeDefined();

    const warning = doc.warnings.find(
      (entry) => entry.code === "orphan-record",
    );
    expect(warning).toBeDefined();
    if (!warning) return;
    expect(warning.message).toContain("c-stray");
  });

  it("does not flag reply records without anchors as orphans", () => {
    const input = [
      "<p>",
      '  <mark data-rd-comment-ids="c-1">word</mark>',
      "</p>",
      '<aside class="rd-review" hidden>',
      "  <rd-comment",
      '    id="c-1"',
      '    data-rd-author="a@example.com"',
      '    data-rd-created-at="2026-05-23T10:14:11Z"',
      '    data-rd-anchor-ids="c-1"',
      '    data-rd-status="open"',
      "  >Parent.</rd-comment>",
      "  <rd-comment",
      '    id="c-2"',
      '    data-rd-author="b@example.com"',
      '    data-rd-created-at="2026-05-23T10:15:11Z"',
      '    data-rd-anchor-ids=""',
      '    data-rd-status="open"',
      '    data-rd-reply-to="c-1"',
      "  >Reply.</rd-comment>",
      "</aside>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(
      doc.warnings.find((entry) => entry.code === "orphan-record"),
    ).toBeUndefined();
  });
});
