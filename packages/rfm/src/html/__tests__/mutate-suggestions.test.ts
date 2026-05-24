import { describe, expect, it } from "vitest";

import {
  acceptHtmlSuggestion,
  parseAnnotatedHtml,
  rejectHtmlSuggestion,
  serializeAnnotatedHtml,
} from "../../index.js";

const fixture = [
  "<!doctype html>",
  '<html lang="en">',
  "  <head>",
  '    <meta charset="utf-8" />',
  "    <title>Doc</title>",
  "  </head>",
  "  <body>",
  "    <article>",
  "      <p>",
  "        We will replace",
  "        <del",
  '          data-rd-suggestion-id="s-3"',
  '          data-rd-author="a@example.com"',
  '          data-rd-created-at="2026-05-23T11:02:30Z"',
  "        >the legacy parser</del><ins",
  '          data-rd-suggestion-id="s-3"',
  '          data-rd-author="a@example.com"',
  '          data-rd-created-at="2026-05-23T11:02:30Z"',
  "        >the new streaming parser</ins>",
  "        next sprint.",
  "      </p>",
  "      <p>Other paragraph stays untouched.</p>",
  "    </article>",
  "  </body>",
  "</html>",
  "",
].join("\n");

describe("acceptHtmlSuggestion", () => {
  it("accepts a substitution and replaces it with the ins content; nothing else changes", () => {
    const doc = parseAnnotatedHtml(fixture);

    const mutated = acceptHtmlSuggestion(doc, { id: "s-3" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Prefix up to the <del> is unchanged.
    const prefixEnd = fixture.indexOf("<del");
    expect(serialized.slice(0, prefixEnd)).toBe(fixture.slice(0, prefixEnd));

    // Suffix from just after </ins> is unchanged.
    const suffixStart = fixture.indexOf("</ins>") + "</ins>".length;
    expect(serialized.slice(serialized.indexOf("\n        next sprint"))).toBe(
      fixture.slice(suffixStart),
    );

    // The del+ins pair is gone; the ins text remains as plain text.
    expect(serialized).not.toContain("<del");
    expect(serialized).not.toContain("<ins");
    expect(serialized).not.toContain("the legacy parser");
    expect(serialized).toContain("the new streaming parser");

    // Other content untouched.
    expect(serialized).toContain("Other paragraph stays untouched.");

    // Reparse: no suggestions remain.
    const reparsed = parseAnnotatedHtml(serialized);
    expect(reparsed.suggestions).toHaveLength(0);
  });

  it("accepts a standalone insertion by removing the wrapper and keeping the text", () => {
    const insertionFixture = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <p>We shipped <ins",
      '        data-rd-suggestion-id="s-1"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T11:00:00Z"',
      "      >three new</ins> features.</p>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(insertionFixture);
    const mutated = acceptHtmlSuggestion(doc, { id: "s-1" });
    const serialized = serializeAnnotatedHtml(mutated);

    expect(serialized).not.toContain("<ins");
    expect(serialized).toContain("We shipped three new features.");

    const reparsed = parseAnnotatedHtml(serialized);
    expect(reparsed.suggestions).toHaveLength(0);
  });

  it("accepts a standalone deletion by removing the wrapper and dropping the text", () => {
    const deletionFixture = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <p>Performance is <del",
      '        data-rd-suggestion-id="s-2"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T11:01:00Z"',
      "      >slightly degraded</del> on the home page.</p>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(deletionFixture);
    const mutated = acceptHtmlSuggestion(doc, { id: "s-2" });
    const serialized = serializeAnnotatedHtml(mutated);

    expect(serialized).not.toContain("<del");
    expect(serialized).not.toContain("slightly degraded");
    expect(serialized).toContain("Performance is  on the home page.");

    const reparsed = parseAnnotatedHtml(serialized);
    expect(reparsed.suggestions).toHaveLength(0);
  });
});

describe("rejectHtmlSuggestion", () => {
  it("rejects a substitution and restores the del content; nothing else changes", () => {
    const doc = parseAnnotatedHtml(fixture);

    const mutated = rejectHtmlSuggestion(doc, { id: "s-3" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Prefix up to the <del> is unchanged.
    const prefixEnd = fixture.indexOf("<del");
    expect(serialized.slice(0, prefixEnd)).toBe(fixture.slice(0, prefixEnd));

    // Suffix from the next-sprint text onward is unchanged.
    const suffixStart = fixture.indexOf("</ins>") + "</ins>".length;
    expect(serialized.slice(serialized.indexOf("\n        next sprint"))).toBe(
      fixture.slice(suffixStart),
    );

    expect(serialized).not.toContain("<del");
    expect(serialized).not.toContain("<ins");
    expect(serialized).toContain("the legacy parser");
    expect(serialized).not.toContain("the new streaming parser");

    expect(serialized).toContain("Other paragraph stays untouched.");

    const reparsed = parseAnnotatedHtml(serialized);
    expect(reparsed.suggestions).toHaveLength(0);
  });

  it("rejects a standalone insertion by removing the wrapper and its text", () => {
    const insertionFixture = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <p>We shipped <ins",
      '        data-rd-suggestion-id="s-1"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T11:00:00Z"',
      "      >three new</ins> features.</p>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(insertionFixture);
    const mutated = rejectHtmlSuggestion(doc, { id: "s-1" });
    const serialized = serializeAnnotatedHtml(mutated);

    expect(serialized).not.toContain("<ins");
    expect(serialized).not.toContain("three new");
    expect(serialized).toContain("We shipped  features.");
  });

  it("rejects a standalone deletion by keeping its text", () => {
    const deletionFixture = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <p>Performance is <del",
      '        data-rd-suggestion-id="s-2"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T11:01:00Z"',
      "      >slightly degraded</del> on the home page.</p>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(deletionFixture);
    const mutated = rejectHtmlSuggestion(doc, { id: "s-2" });
    const serialized = serializeAnnotatedHtml(mutated);

    expect(serialized).not.toContain("<del");
    expect(serialized).toContain(
      "Performance is slightly degraded on the home page.",
    );
  });
});

describe("suggestion mutators protected/literal zones", () => {
  const preCodeThenReal = [
    "<!doctype html>",
    '<html lang="en">',
    "  <body>",
    "    <article>",
    "      <pre><code>",
    '<ins data-rd-suggestion-id="s-1">literal ins inside pre</ins>',
    '<del data-rd-suggestion-id="s-1">literal del inside pre</del>',
    "      </code></pre>",
    "      <p>",
    "        Real change here: <del",
    '          data-rd-suggestion-id="s-1"',
    '          data-rd-author="a@example.com"',
    '          data-rd-created-at="2026-05-23T11:02:30Z"',
    "        >old phrase</del><ins",
    '          data-rd-suggestion-id="s-1"',
    '          data-rd-author="a@example.com"',
    '          data-rd-created-at="2026-05-23T11:02:30Z"',
    "        >new phrase</ins> end.",
    "      </p>",
    "    </article>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  const literalZoneThenReal = [
    "<!doctype html>",
    '<html lang="en">',
    "  <body>",
    "    <article>",
    "      <div data-rd-literal>",
    '        <ins data-rd-suggestion-id="s-7">literal-ins</ins>',
    "      </div>",
    "      <p>Real: <ins",
    '          data-rd-suggestion-id="s-7"',
    '          data-rd-author="a@example.com"',
    '          data-rd-created-at="2026-05-23T11:02:30Z"',
    "        >real-ins</ins> end.</p>",
    "    </article>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  it("acceptHtmlSuggestion ignores <ins>/<del> inside <pre><code> and mutates the real one only", () => {
    const doc = parseAnnotatedHtml(preCodeThenReal);

    const preOpen = preCodeThenReal.indexOf("<pre>");
    const preClose =
      preCodeThenReal.indexOf("</pre>", preOpen) + "</pre>".length;
    const literalPreBlock = preCodeThenReal.slice(preOpen, preClose);

    const mutated = acceptHtmlSuggestion(doc, { id: "s-1" });
    const serialized = serializeAnnotatedHtml(mutated);

    // The pre/code block survives byte-for-byte.
    expect(serialized).toContain(literalPreBlock);

    // The real substitution was resolved to the ins text.
    expect(serialized).toContain("Real change here: new phrase end.");

    // The real <del>/<ins> pair is gone.
    expect(serialized).not.toContain("old phrase");
    expect(serialized).not.toContain(">new phrase</ins>");
  });

  it("rejectHtmlSuggestion ignores <ins>/<del> inside <pre><code> and mutates the real one only", () => {
    const doc = parseAnnotatedHtml(preCodeThenReal);

    const preOpen = preCodeThenReal.indexOf("<pre>");
    const preClose =
      preCodeThenReal.indexOf("</pre>", preOpen) + "</pre>".length;
    const literalPreBlock = preCodeThenReal.slice(preOpen, preClose);

    const mutated = rejectHtmlSuggestion(doc, { id: "s-1" });
    const serialized = serializeAnnotatedHtml(mutated);

    // pre/code block intact.
    expect(serialized).toContain(literalPreBlock);

    // Real substitution resolved to del text (rejected).
    expect(serialized).toContain("Real change here: old phrase end.");
    expect(serialized).not.toContain(">new phrase</ins>");
  });

  it("acceptHtmlSuggestion ignores <ins> inside data-rd-literal and mutates the real one only", () => {
    const doc = parseAnnotatedHtml(literalZoneThenReal);

    const litOpen = literalZoneThenReal.indexOf("<div data-rd-literal>");
    const litClose =
      literalZoneThenReal.indexOf("</div>", litOpen) + "</div>".length;
    const litBlock = literalZoneThenReal.slice(litOpen, litClose);

    const mutated = acceptHtmlSuggestion(doc, { id: "s-7" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Literal subtree intact byte-for-byte.
    expect(serialized).toContain(litBlock);

    // Real insertion accepted -> text remains as plain text.
    expect(serialized).toContain("<p>Real: real-ins end.</p>");
  });

  it("rejectHtmlSuggestion ignores <ins> inside data-rd-literal and mutates the real one only", () => {
    const doc = parseAnnotatedHtml(literalZoneThenReal);

    const litOpen = literalZoneThenReal.indexOf("<div data-rd-literal>");
    const litClose =
      literalZoneThenReal.indexOf("</div>", litOpen) + "</div>".length;
    const litBlock = literalZoneThenReal.slice(litOpen, litClose);

    const mutated = rejectHtmlSuggestion(doc, { id: "s-7" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Literal subtree intact byte-for-byte.
    expect(serialized).toContain(litBlock);

    // Real insertion rejected -> text dropped.
    expect(serialized).toContain("<p>Real:  end.</p>");
    expect(serialized).not.toContain(">real-ins</ins>");
  });
});
