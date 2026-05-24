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

function asElement(node: HtmlNode | undefined): HtmlElementNode {
  if (!node || node.type !== "element") {
    throw new Error(`Expected element node, got ${node?.type ?? "undefined"}`);
  }
  return node;
}

function elementChildren(element: HtmlElementNode): HtmlElementNode[] {
  return element.children.filter(
    (child): child is HtmlElementNode => child.type === "element",
  );
}

describe("parseAnnotatedHtml — plain HTML", () => {
  it("parses an empty document into an empty AnnotatedHtmlDoc", () => {
    const doc = parseAnnotatedHtml("");

    expect(doc.format).toBe("annotated-html");
    expect(doc.version).toBe("0.1");
    expect(doc.source).toBe("");
    expect(doc.blocks).toEqual([]);
    expect(doc.comments).toEqual([]);
    expect(doc.suggestions).toEqual([]);
    expect(doc.warnings).toEqual([]);
  });

  it("parses plain-document.html and exposes top-level blocks in document order", () => {
    const html = readFixture("plain-document.html");
    const doc = parseAnnotatedHtml(html);

    expect(doc.format).toBe("annotated-html");
    expect(doc.source).toBe(html);
    expect(doc.blocks).toHaveLength(1);

    const article = asElement(doc.blocks[0]);
    expect(article.tag).toBe("article");

    const articleChildren = elementChildren(article);
    expect(articleChildren.map((child) => child.tag)).toEqual([
      "h1",
      "p",
      "p",
      "ul",
    ]);

    const list = asElement(articleChildren[3]);
    const items = elementChildren(list);
    expect(items.map((item) => item.tag)).toEqual(["li", "li", "li"]);
    expect(
      items.map((item) =>
        item.children
          .filter(
            (child): child is { type: "text"; value: string } =>
              child.type === "text",
          )
          .map((child) => child.value)
          .join(""),
      ),
    ).toEqual([
      "Morning: clear.",
      "Afternoon: scattered clouds.",
      "Evening: rain likely.",
    ]);
  });

  it("does not invent ids, comments, or suggestions for plain content", () => {
    const html = readFixture("plain-document.html");
    const doc = parseAnnotatedHtml(html);

    expect(doc.comments).toEqual([]);
    expect(doc.suggestions).toEqual([]);
    expect(doc.warnings).toEqual([]);
  });

  it("parses a fragment without doctype/head/body", () => {
    const doc = parseAnnotatedHtml(
      "<p>First paragraph.</p><p>Second paragraph.</p>",
    );

    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks.map((node) => asElement(node).tag)).toEqual(["p", "p"]);
    expect(doc.comments).toEqual([]);
    expect(doc.suggestions).toEqual([]);
    expect(doc.warnings).toEqual([]);
  });

  it("preserves the order and identity of inline runs inside a paragraph", () => {
    const doc = parseAnnotatedHtml(
      "<p>Hello <strong>brave</strong> <em>new</em> world!</p>",
    );

    expect(doc.blocks).toHaveLength(1);
    const paragraph = asElement(doc.blocks[0]);
    expect(paragraph.tag).toBe("p");

    const summary = paragraph.children.map((child) =>
      child.type === "text"
        ? { kind: "text" as const, value: child.value }
        : { kind: "element" as const, tag: child.tag },
    );

    expect(summary).toEqual([
      { kind: "text", value: "Hello " },
      { kind: "element", tag: "strong" },
      { kind: "text", value: " " },
      { kind: "element", tag: "em" },
      { kind: "text", value: " world!" },
    ]);

    const strong = asElement(paragraph.children[1]);
    expect(strong.children).toEqual([
      expect.objectContaining({ type: "text", value: "brave" }),
    ]);
    const em = asElement(paragraph.children[3]);
    expect(em.children).toEqual([
      expect.objectContaining({ type: "text", value: "new" }),
    ]);
  });
});
