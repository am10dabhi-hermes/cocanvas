import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type AnnotatedHtmlDoc,
  parseAnnotatedHtml,
  serializeAnnotatedHtml,
} from "../../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../../.context/fixtures/html");

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

describe("serializeAnnotatedHtml — plain HTML", () => {
  it("serializes an empty model into an empty document", () => {
    const emptyDoc: AnnotatedHtmlDoc = {
      format: "annotated-html",
      version: "0.1",
      source: "",
      blocks: [],
      comments: [],
      suggestions: [],
      warnings: [],
    };

    expect(serializeAnnotatedHtml(emptyDoc)).toBe("");
  });

  it("serializes parseAnnotatedHtml('') back to an empty string", () => {
    expect(serializeAnnotatedHtml(parseAnnotatedHtml(""))).toBe("");
  });

  it("round-trips plain-document.html with low-churn equality", () => {
    const html = readFixture("plain-document.html");

    expect(serializeAnnotatedHtml(parseAnnotatedHtml(html))).toBe(html);
  });

  it("is idempotent: serialize(parse(serialize(parse(plain)))) === serialize(parse(plain))", () => {
    const html = readFixture("plain-document.html");

    const once = serializeAnnotatedHtml(parseAnnotatedHtml(html));
    const twice = serializeAnnotatedHtml(parseAnnotatedHtml(once));

    expect(twice).toBe(once);
  });
});
