import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type HtmlElementNode,
  type HtmlNode,
  parseAnnotatedHtml,
  serializeAnnotatedHtml,
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

describe("serializeAnnotatedHtml — commented HTML", () => {
  it("round-trips commented-document.html under low-churn equality", () => {
    const html = readFixture("commented-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));
    expect(serialized).toBe(html);

    const reparsed = parseAnnotatedHtml(serialized);

    const expected = [
      {
        id: "c-7uG2",
        status: "open",
        replyTo: null,
        bodyIncludes: "clear sky",
      },
      {
        id: "c-9aB1",
        status: "open",
        replyTo: null,
        bodyIncludes: "specific time window",
      },
      {
        id: "c-3xY8",
        status: "open",
        replyTo: "c-9aB1",
        bodyIncludes: "after 7pm",
      },
      {
        id: "c-4r5T",
        status: "resolved",
        replyTo: null,
        bodyIncludes: "Resolved offline",
      },
    ];

    for (const expectedComment of expected) {
      const comment = reparsed.comments.find(
        (entry) => entry.id === expectedComment.id,
      );
      expect(comment).toBeDefined();
      if (!comment) continue;
      expect(comment.status).toBe(expectedComment.status);
      expect(comment.replyTo).toBe(expectedComment.replyTo);
      expect(comment.body).toContain(expectedComment.bodyIncludes);
    }
  });

  it("preserves comment order in the rd-review aside", () => {
    const html = readFixture("commented-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    const ids = Array.from(
      serialized.matchAll(/<rd-comment\b[^>]*\sid="([^"]+)"/g),
      (match) => match[1] ?? "",
    );

    expect(ids).toEqual(["c-7uG2", "c-9aB1", "c-3xY8", "c-4r5T"]);
  });

  it("preserves multi-id anchor attribute value order", () => {
    const html = readFixture("commented-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    expect(serialized).toContain('data-rd-comment-ids="c-9aB1 c-3xY8"');

    const reparsed = parseAnnotatedHtml(serialized);

    const multiAnchors = findElements(
      reparsed.blocks,
      (element) =>
        element.tag === "mark" &&
        (element.attrs["data-rd-comment-ids"] ?? "")
          .split(/\s+/)
          .filter(Boolean).length > 1,
    );

    expect(multiAnchors).toHaveLength(1);
    const mark = multiAnchors[0];
    if (!mark) return;

    const ids = (mark.attrs["data-rd-comment-ids"] ?? "")
      .split(/\s+/)
      .filter((id) => id.length > 0);
    expect(ids).toEqual(["c-9aB1", "c-3xY8"]);
  });
});
