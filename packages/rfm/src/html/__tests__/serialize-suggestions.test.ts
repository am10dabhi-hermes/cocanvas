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

describe("serializeAnnotatedHtml — suggestions", () => {
  it("round-trips standalone insertions and deletions", () => {
    const html = readFixture("suggestions-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));
    expect(serialized).toBe(html);

    const reparsed = parseAnnotatedHtml(serialized);

    const insertion = reparsed.suggestions.find(
      (suggestion) => suggestion.id === "s-1",
    );
    expect(insertion).toBeDefined();
    if (!insertion) return;
    expect(insertion.kind).toBe("insertion");
    expect(insertion.status).toBe("open");
    expect(insertion.author).toBe("ananth@cradlewise.com");
    expect(insertion.createdAt).toBe("2026-05-23T11:00:00Z");
    expect(insertion.insertedText).toBe("three new");

    const deletion = reparsed.suggestions.find(
      (suggestion) => suggestion.id === "s-2",
    );
    expect(deletion).toBeDefined();
    if (!deletion) return;
    expect(deletion.kind).toBe("deletion");
    expect(deletion.status).toBe("open");
    expect(deletion.author).toBe("ananth@cradlewise.com");
    expect(deletion.createdAt).toBe("2026-05-23T11:01:10Z");
    expect(deletion.deletedText).toBe("slightly degraded");
  });

  it("round-trips substitution pairs with shared id", () => {
    const html = readFixture("suggestions-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));
    const reparsed = parseAnnotatedHtml(serialized);

    const matching = reparsed.suggestions.filter(
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

  it("keeps del immediately adjacent to ins for substitutions", () => {
    const html = readFixture("suggestions-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    expect(serialized).toContain(
      '>the legacy parser</del><ins\n          data-rd-suggestion-id="s-3"',
    );
  });
});
