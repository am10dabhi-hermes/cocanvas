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

describe("parseAnnotatedHtml — suggestions", () => {
  it("parses a standalone insertion from suggestions-document.html", () => {
    const html = readFixture("suggestions-document.html");
    const doc = parseAnnotatedHtml(html);

    const insertion = doc.suggestions.find(
      (suggestion) => suggestion.id === "s-1",
    );

    expect(insertion).toBeDefined();
    if (!insertion) return;
    expect(insertion.kind).toBe("insertion");
    expect(insertion.author).toBe("ananth@cradlewise.com");
    expect(insertion.createdAt).toBe("2026-05-23T11:00:00Z");
    expect(insertion.status).toBe("open");
    expect(insertion.insertedText).toBe("three new");
    expect(insertion.deletedText).toBeUndefined();
  });

  it("parses a standalone deletion from suggestions-document.html", () => {
    const html = readFixture("suggestions-document.html");
    const doc = parseAnnotatedHtml(html);

    const deletion = doc.suggestions.find(
      (suggestion) => suggestion.id === "s-2",
    );

    expect(deletion).toBeDefined();
    if (!deletion) return;
    expect(deletion.kind).toBe("deletion");
    expect(deletion.author).toBe("ananth@cradlewise.com");
    expect(deletion.createdAt).toBe("2026-05-23T11:01:10Z");
    expect(deletion.status).toBe("open");
    expect(deletion.deletedText).toBe("slightly degraded");
    expect(deletion.insertedText).toBeUndefined();
  });

  it("parses a del + ins substitution pair sharing one id as one logical suggestion", () => {
    const html = readFixture("suggestions-document.html");
    const doc = parseAnnotatedHtml(html);

    const matching = doc.suggestions.filter(
      (suggestion) => suggestion.id === "s-3",
    );

    expect(matching).toHaveLength(1);
    const substitution = matching[0];
    if (!substitution) return;
    expect(substitution.kind).toBe("substitution");
    expect(substitution.deletedText).toBe("the legacy parser");
    expect(substitution.insertedText).toBe("the new streaming parser");
    expect(substitution.author).toBe("ananth@cradlewise.com");
    expect(substitution.createdAt).toBe("2026-05-23T11:02:30Z");
    expect(substitution.status).toBe("open");
  });

  it("treats a del + ins with mismatched ids as two independent suggestions", () => {
    const input = [
      "<p>",
      '  Before <del data-rd-suggestion-id="d-1" data-rd-author="a@example.com" data-rd-created-at="2026-05-23T12:00:00Z">old</del><ins data-rd-suggestion-id="i-2" data-rd-author="b@example.com" data-rd-created-at="2026-05-23T12:00:05Z">new</ins> after.',
      "</p>",
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    expect(doc.suggestions).toHaveLength(2);

    const deletion = doc.suggestions.find(
      (suggestion) => suggestion.id === "d-1",
    );
    const insertion = doc.suggestions.find(
      (suggestion) => suggestion.id === "i-2",
    );

    expect(deletion).toBeDefined();
    if (!deletion) return;
    expect(deletion.kind).toBe("deletion");
    expect(deletion.deletedText).toBe("old");

    expect(insertion).toBeDefined();
    if (!insertion) return;
    expect(insertion.kind).toBe("insertion");
    expect(insertion.insertedText).toBe("new");
  });

  it("preserves <ins> and <del> nodes in doc.blocks with attrs intact", () => {
    const html = readFixture("suggestions-document.html");
    const doc = parseAnnotatedHtml(html);

    const insElements = findElements(
      doc.blocks,
      (element) => element.tag === "ins",
    );
    const delElements = findElements(
      doc.blocks,
      (element) => element.tag === "del",
    );

    expect(insElements.length).toBeGreaterThanOrEqual(2);
    expect(delElements.length).toBeGreaterThanOrEqual(2);

    const insIds = insElements.map(
      (element) => element.attrs["data-rd-suggestion-id"],
    );
    const delIds = delElements.map(
      (element) => element.attrs["data-rd-suggestion-id"],
    );

    expect(insIds).toContain("s-1");
    expect(insIds).toContain("s-3");
    expect(delIds).toContain("s-2");
    expect(delIds).toContain("s-3");
  });

  it("defaults status to open when the attribute is missing and ignores unknown values", () => {
    const input = [
      '<p><ins data-rd-suggestion-id="s-default" data-rd-author="a@example.com" data-rd-created-at="2026-05-23T12:00:00Z">added</ins></p>',
      '<p><del data-rd-suggestion-id="s-unknown" data-rd-author="a@example.com" data-rd-created-at="2026-05-23T12:00:01Z" data-rd-status="weird">gone</del></p>',
    ].join("\n");

    const doc = parseAnnotatedHtml(input);

    const defaulted = doc.suggestions.find(
      (suggestion) => suggestion.id === "s-default",
    );
    expect(defaulted).toBeDefined();
    if (!defaulted) return;
    expect(defaulted.status).toBe("open");

    const unknown = doc.suggestions.find(
      (suggestion) => suggestion.id === "s-unknown",
    );
    expect(unknown).toBeDefined();
    if (!unknown) return;
    expect(unknown.status).toBe("open");
  });
});
