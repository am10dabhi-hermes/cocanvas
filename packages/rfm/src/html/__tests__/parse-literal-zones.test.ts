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

describe("parseAnnotatedHtml — literal / protected zones", () => {
  it("does not extract comments or suggestions from <script> bodies", () => {
    const input = [
      "<html>",
      "  <head>",
      "    <script>",
      '      const example = "<mark data-rd-comment-ids=\\"c-script-1\\">x</mark>";',
      '      const r = "<rd-comment id=\\"c-script-1\\">x</rd-comment>";',
      "    </script>",
      "  </head>",
      "  <body><p>hello</p></body>",
      "</html>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(
      doc.comments.find((comment) => comment.id === "c-script-1"),
    ).toBeUndefined();
    const scriptAnchorIds = doc.warnings
      .filter((w) => w.code === "orphan-anchor")
      .map((w) => w.message);
    for (const message of scriptAnchorIds) {
      expect(message).not.toContain("c-script-1");
    }
  });

  it("does not extract comments from <style> bodies", () => {
    const input = [
      "<html>",
      "  <head>",
      "    <style>",
      '      /* <mark data-rd-comment-ids="c-style-1">x</mark> */',
      '      /* <rd-comment id="c-style-1">x</rd-comment> */',
      "    </style>",
      "  </head>",
      "  <body><p>hello</p></body>",
      "</html>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(
      doc.comments.find((comment) => comment.id === "c-style-1"),
    ).toBeUndefined();
    for (const warning of doc.warnings) {
      expect(warning.message).not.toContain("c-style-1");
    }
  });

  it("does not extract comments from <pre><code> bodies with actual nested markup", () => {
    const input = [
      "<article>",
      "  <pre><code>",
      '    <mark data-rd-comment-ids="c-pre-1">looks like an anchor</mark>',
      '    <rd-comment id="c-pre-1" data-rd-author="x@example.com" data-rd-created-at="2026-05-23T13:00:00Z" data-rd-anchor-ids="c-pre-1" data-rd-status="open">looks like a record</rd-comment>',
      "  </code></pre>",
      "</article>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(
      doc.comments.find((comment) => comment.id === "c-pre-1"),
    ).toBeUndefined();
    for (const warning of doc.warnings) {
      expect(warning.message).not.toContain("c-pre-1");
    }
  });

  it("does not extract suggestions from <pre><code> bodies", () => {
    const input = [
      "<article>",
      "  <pre><code>",
      '    <ins data-rd-suggestion-id="s-pre-1" data-rd-author="x@example.com" data-rd-created-at="2026-05-23T13:00:00Z">looks inserted</ins>',
      '    <del data-rd-suggestion-id="s-pre-2" data-rd-author="x@example.com" data-rd-created-at="2026-05-23T13:00:00Z">looks deleted</del>',
      "  </code></pre>",
      "</article>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(doc.suggestions.find((s) => s.id === "s-pre-1")).toBeUndefined();
    expect(doc.suggestions.find((s) => s.id === "s-pre-2")).toBeUndefined();
  });

  it("does not extract comments from a standalone <code> element with actual nested markup", () => {
    const input = [
      "<p>",
      "  Inline ",
      '  <code><mark data-rd-comment-ids="c-code-1">snippet</mark></code>',
      "  here.",
      "</p>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(
      doc.comments.find((comment) => comment.id === "c-code-1"),
    ).toBeUndefined();
    const codeAnchor = findElements(
      doc.blocks,
      (element) =>
        element.tag === "mark" &&
        element.attrs["data-rd-comment-ids"] === "c-code-1",
    );
    expect(codeAnchor.length).toBe(1);
  });

  it("does not extract comments from elements with data-rd-literal", () => {
    const input = [
      "<article>",
      "  <div data-rd-literal>",
      '    <mark data-rd-comment-ids="c-literal-1">not parsed</mark>',
      '    <rd-comment id="c-literal-1" data-rd-author="x@example.com" data-rd-created-at="2026-05-23T13:00:00Z" data-rd-anchor-ids="c-literal-1" data-rd-status="open">ignored</rd-comment>',
      '    <ins data-rd-suggestion-id="s-literal-1" data-rd-author="x@example.com" data-rd-created-at="2026-05-23T13:00:00Z">also ignored</ins>',
      "  </div>",
      "</article>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(
      doc.comments.find((comment) => comment.id === "c-literal-1"),
    ).toBeUndefined();
    expect(doc.suggestions.find((s) => s.id === "s-literal-1")).toBeUndefined();
    for (const warning of doc.warnings) {
      expect(warning.message).not.toContain("c-literal-1");
    }
  });

  it("preserves protected-zone children in doc.blocks as ordinary nodes", () => {
    const input = [
      "<article>",
      "  <div data-rd-literal>",
      '    <mark data-rd-comment-ids="c-literal-1">not parsed</mark>',
      "  </div>",
      "</article>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    const literalMark = findElements(
      doc.blocks,
      (element) =>
        element.tag === "mark" &&
        element.attrs["data-rd-comment-ids"] === "c-literal-1",
    );
    expect(literalMark.length).toBe(1);
  });

  it("still parses the one real comment in literal-zones.html", () => {
    const html = readFixture("literal-zones.html");
    const doc = parseAnnotatedHtml(html);

    const real = doc.comments.find((comment) => comment.id === "c-real-1");
    expect(real).toBeDefined();
    if (!real) return;
    expect(real.author).toBe("ananth@cradlewise.com");
    expect(real.status).toBe("open");
    expect(real.body).toContain("only real comment");

    expect(doc.comments).toHaveLength(1);

    for (const warning of doc.warnings) {
      expect(warning.code).not.toBe("orphan-anchor");
    }
  });
});
