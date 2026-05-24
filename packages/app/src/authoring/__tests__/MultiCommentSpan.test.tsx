import { describe, expect, it } from "vitest";
import {
  addHtmlComment,
  parseAnnotatedHtml,
  removeHtmlComment,
} from "@roughdraft/rfm";

const PLAIN_HTML = `<!doctype html>
<html lang="en">
  <head><title>Multi-comment fixture</title></head>
  <body>
    <article>
      <p>We expanded the team in Berlin and Bangalore.</p>
    </article>
  </body>
</html>`;

const ALREADY_ANCHORED_HTML = `<!doctype html>
<html lang="en">
  <head><title>Already anchored fixture</title></head>
  <body>
    <article>
      <p>We expanded the team in <mark data-rd-comment-ids="c-1">Berlin and Bangalore</mark>.</p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-1" data-rd-anchor-ids="c-1" data-rd-status="open" data-rd-author="a" data-rd-created-at="2026-05-23T12:00:00Z">First comment.</rd-comment>
    </aside>
  </body>
</html>`;

describe("MultiCommentSpan", () => {
  it("adding a second comment to an already-anchored span keeps a single mark with two ids", () => {
    const doc0 = parseAnnotatedHtml(ALREADY_ANCHORED_HTML);
    const doc1 = addHtmlComment(doc0, {
      id: "c-2",
      anchor: { text: "Berlin and Bangalore" },
      author: "b",
      createdAt: "2026-05-23T12:05:00Z",
      body: "Second comment.",
    });

    // Exactly one mark wrapping the anchored span (no nested or duplicated marks).
    const markMatches = doc1.source.match(/<mark\b/g) ?? [];
    expect(markMatches.length).toBe(1);

    // The single mark holds both ids.
    const idAttr = doc1.source.match(/data-rd-comment-ids="([^"]*)"/);
    expect(idAttr).not.toBeNull();
    const ids = (idAttr?.[1] ?? "").split(/\s+/).filter(Boolean);
    expect(ids).toEqual(expect.arrayContaining(["c-1", "c-2"]));
    expect(ids).toHaveLength(2);

    // Both comments are in the model.
    expect(doc1.comments.map((c) => c.id)).toEqual(
      expect.arrayContaining(["c-1", "c-2"]),
    );
  });

  it("removing one of N comments updates the mark to N-1 ids without nesting", () => {
    const doc0 = parseAnnotatedHtml(ALREADY_ANCHORED_HTML);
    const doc1 = addHtmlComment(doc0, {
      id: "c-2",
      anchor: { text: "Berlin and Bangalore" },
      author: "b",
      createdAt: "2026-05-23T12:05:00Z",
      body: "Second comment.",
    });

    const doc2 = removeHtmlComment(doc1, { id: "c-1" });

    const markMatches = doc2.source.match(/<mark\b/g) ?? [];
    expect(markMatches.length).toBe(1);

    const idAttr = doc2.source.match(/data-rd-comment-ids="([^"]*)"/);
    const ids = (idAttr?.[1] ?? "").split(/\s+/).filter(Boolean);
    expect(ids).toEqual(["c-2"]);

    expect(doc2.comments.map((c) => c.id)).toEqual(["c-2"]);
  });

  it("adds a fresh anchor when the span is not previously wrapped", () => {
    const doc0 = parseAnnotatedHtml(PLAIN_HTML);
    const doc1 = addHtmlComment(doc0, {
      id: "c-fresh",
      anchor: { text: "Berlin and Bangalore" },
      author: "a",
      createdAt: "2026-05-23T12:00:00Z",
      body: "First.",
    });

    expect(doc1.source).toContain(
      '<mark data-rd-comment-ids="c-fresh">Berlin and Bangalore</mark>',
    );
    expect(doc1.comments.map((c) => c.id)).toEqual(["c-fresh"]);
  });
});
