import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseAnnotatedHtml, serializeAnnotatedHtml } from "../../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../../.context/fixtures/html");

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

function extractBetween(html: string, start: string, end: string): string {
  const startIdx = html.indexOf(start);
  if (startIdx === -1) {
    throw new Error(`start marker not found: ${start}`);
  }
  const afterStart = startIdx + start.length;
  const endIdx = html.indexOf(end, afterStart);
  if (endIdx === -1) {
    throw new Error(`end marker not found: ${end}`);
  }
  return html.slice(afterStart, endIdx);
}

describe("serializeAnnotatedHtml — literal / protected zones", () => {
  it("preserves <script> body byte-for-byte", () => {
    const html = readFixture("literal-zones.html");
    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    expect(serialized).toBe(html);

    const originalScript = extractBetween(html, "<script>", "</script>");
    const serializedScript = extractBetween(
      serialized,
      "<script>",
      "</script>",
    );

    expect(serializedScript).toBe(originalScript);
  });

  it("preserves <pre><code> body byte-for-byte", () => {
    const html = readFixture("literal-zones.html");
    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    const originalPre = extractBetween(html, "<pre><code>", "</code></pre>");
    const serializedPre = extractBetween(
      serialized,
      "<pre><code>",
      "</code></pre>",
    );

    expect(serializedPre).toBe(originalPre);
    expect(serializedPre).toContain(
      '&lt;rd-comment id="c-pre-1"&gt;not a real comment&lt;/rd-comment&gt;',
    );
  });

  it("preserves data-rd-literal body byte-for-byte and exposes only the real comment", () => {
    const html = readFixture("literal-zones.html");
    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    const literalStart = "<div data-rd-literal>";
    const literalEnd = "</div>";

    const originalBlock = extractBetween(html, literalStart, literalEnd);
    const serializedBlock = extractBetween(
      serialized,
      literalStart,
      literalEnd,
    );

    expect(serializedBlock).toBe(originalBlock);

    const reparsed = parseAnnotatedHtml(serialized);

    const commentIds = reparsed.comments.map((comment) => comment.id);
    expect(commentIds).toEqual(["c-real-1"]);

    expect(
      reparsed.suggestions.find((s) => s.id === "s-pre-1"),
    ).toBeUndefined();
    expect(
      reparsed.comments.find((comment) => comment.id === "c-pre-1"),
    ).toBeUndefined();
    expect(
      reparsed.comments.find((comment) => comment.id === "c-literal-1"),
    ).toBeUndefined();
  });
});
