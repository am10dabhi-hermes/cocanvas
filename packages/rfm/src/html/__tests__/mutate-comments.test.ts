import { describe, expect, it } from "vitest";

import {
  addHtmlComment,
  editHtmlComment,
  parseAnnotatedHtml,
  removeHtmlComment,
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
  '      <p>The <mark data-rd-comment-ids="c-existing">sky</mark> is blue today.</p>',
  "      <p>Rain is likely tonight.</p>",
  "    </article>",
  '    <aside class="rd-review" hidden>',
  "      <rd-comment",
  '        id="c-existing"',
  '        data-rd-author="author@example.com"',
  '        data-rd-created-at="2026-05-23T10:00:00Z"',
  '        data-rd-anchor-ids="c-existing"',
  '        data-rd-status="open"',
  "      >Existing comment body.</rd-comment>",
  "    </aside>",
  "  </body>",
  "</html>",
  "",
].join("\n");

function sliceBeforeAside(source: string): string {
  const idx = source.indexOf('<aside class="rd-review"');
  return source.slice(0, idx);
}

function sliceAfterAside(source: string): string {
  const idx = source.indexOf("</aside>");
  return source.slice(idx + "</aside>".length);
}

describe("addHtmlComment", () => {
  it("adds a new comment on a fresh span and only the targeted anchor + rd-review changes", () => {
    const doc = parseAnnotatedHtml(fixture);

    const mutated = addHtmlComment(doc, {
      id: "c-new",
      anchor: { text: "blue today" },
      author: "newauthor@example.com",
      createdAt: "2026-05-23T11:00:00Z",
      status: "open",
      body: "Specify the time of day.",
    });

    const serialized = serializeAnnotatedHtml(mutated);

    expect(serialized).not.toBe(fixture);

    // Original content outside the anchor and the aside is unchanged.
    const originalPrefix = fixture.slice(0, fixture.indexOf("is blue today"));
    const mutatedPrefix = serialized.slice(0, originalPrefix.length);
    expect(mutatedPrefix).toBe(originalPrefix);

    // The targeted span is now wrapped in a fresh <mark>.
    expect(serialized).toContain(
      'is <mark data-rd-comment-ids="c-new">blue today</mark>.',
    );

    // The original mark (c-existing) remains intact.
    expect(serialized).toContain(
      '<mark data-rd-comment-ids="c-existing">sky</mark>',
    );

    // Everything between the wrap end and the rd-review aside is unchanged.
    const originalBetween = fixture.slice(
      fixture.indexOf("blue today") + "blue today".length,
      fixture.indexOf('<aside class="rd-review"'),
    );
    const mutatedAsideIdx = serialized.indexOf('<aside class="rd-review"');
    const mutatedBetween = serialized.slice(
      mutatedAsideIdx - originalBetween.length,
      mutatedAsideIdx,
    );
    expect(mutatedBetween).toBe(originalBetween);

    // Everything after the closing </aside> is unchanged.
    expect(sliceAfterAside(serialized)).toBe(sliceAfterAside(fixture));

    // A new <rd-comment> record is in the aside.
    expect(serialized).toContain('id="c-new"');
    expect(serialized).toContain("Specify the time of day.");
    expect(serialized).toContain('data-rd-author="newauthor@example.com"');

    // Existing record is preserved.
    expect(serialized).toContain('id="c-existing"');
    expect(serialized).toContain("Existing comment body.");

    // The reparsed model recognises the new comment + anchor.
    const reparsed = parseAnnotatedHtml(serialized);
    const newComment = reparsed.comments.find((entry) => entry.id === "c-new");
    expect(newComment).toBeDefined();
    if (!newComment) return;
    expect(newComment.body).toBe("Specify the time of day.");
    expect(newComment.status).toBe("open");
    expect(newComment.author).toBe("newauthor@example.com");
    expect(reparsed.warnings).toEqual([]);
  });
});

describe("editHtmlComment", () => {
  it("edits an existing comment body and only that record's text changes", () => {
    const doc = parseAnnotatedHtml(fixture);

    const mutated = editHtmlComment(doc, {
      id: "c-existing",
      body: "Updated comment body.",
    });

    const serialized = serializeAnnotatedHtml(mutated);

    // Bytes outside the aside are unchanged.
    expect(sliceBeforeAside(serialized)).toBe(sliceBeforeAside(fixture));
    expect(sliceAfterAside(serialized)).toBe(sliceAfterAside(fixture));

    // The body text inside <rd-comment> is updated; original is gone.
    expect(serialized).not.toContain("Existing comment body.");
    expect(serialized).toContain("Updated comment body.");

    // The record attributes are untouched (id, author, createdAt, status).
    expect(serialized).toContain('id="c-existing"');
    expect(serialized).toContain('data-rd-author="author@example.com"');
    expect(serialized).toContain('data-rd-created-at="2026-05-23T10:00:00Z"');
    expect(serialized).toContain('data-rd-status="open"');

    // Reparse confirms.
    const reparsed = parseAnnotatedHtml(serialized);
    const comment = reparsed.comments.find(
      (entry) => entry.id === "c-existing",
    );
    expect(comment).toBeDefined();
    if (!comment) return;
    expect(comment.body).toBe("Updated comment body.");
  });
});

describe("removeHtmlComment", () => {
  const twoOnSameSpan = [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Doc</title>",
    "  </head>",
    "  <body>",
    "    <article>",
    '      <p>The <mark data-rd-comment-ids="c-1 c-2">sky</mark> is blue.</p>',
    "    </article>",
    '    <aside class="rd-review" hidden>',
    "      <rd-comment",
    '        id="c-1"',
    '        data-rd-author="a@example.com"',
    '        data-rd-created-at="2026-05-23T10:00:00Z"',
    '        data-rd-anchor-ids="c-1"',
    '        data-rd-status="open"',
    "      >First.</rd-comment>",
    "      <rd-comment",
    '        id="c-2"',
    '        data-rd-author="b@example.com"',
    '        data-rd-created-at="2026-05-23T10:01:00Z"',
    '        data-rd-anchor-ids="c-2"',
    '        data-rd-status="open"',
    "      >Second.</rd-comment>",
    "    </aside>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  it("removes a comment and only the targeted anchor + record disappear", () => {
    const doc = parseAnnotatedHtml(fixture);

    const mutated = removeHtmlComment(doc, { id: "c-existing" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Outside the aside and the targeted mark, bytes are unchanged.
    const beforeMark = fixture.slice(0, fixture.indexOf("<mark"));
    expect(serialized.slice(0, beforeMark.length)).toBe(beforeMark);

    // The mark wrapper around "sky" is unwrapped (mark removed but text kept).
    expect(serialized).not.toContain("<mark data-rd-comment-ids");
    expect(serialized).toContain("The sky is blue today.");

    // The record is gone.
    expect(serialized).not.toContain('id="c-existing"');
    expect(serialized).not.toContain("Existing comment body.");

    // Trailing content after </aside> is unchanged.
    expect(sliceAfterAside(serialized)).toBe(sliceAfterAside(fixture));

    // Reparse: zero comments, no warnings.
    const reparsed = parseAnnotatedHtml(serialized);
    expect(reparsed.comments).toHaveLength(0);
    expect(reparsed.warnings).toEqual([]);
  });

  it("removes only one of multiple comment ids from a shared anchor", () => {
    const doc = parseAnnotatedHtml(twoOnSameSpan);

    const mutated = removeHtmlComment(doc, { id: "c-1" });
    const serialized = serializeAnnotatedHtml(mutated);

    // The mark survives with the remaining id only.
    expect(serialized).toContain('data-rd-comment-ids="c-2"');
    expect(serialized).not.toContain('"c-1 c-2"');

    // Only the c-1 record disappears; c-2 stays.
    expect(serialized).not.toContain('id="c-1"');
    expect(serialized).not.toContain("First.</rd-comment>");
    expect(serialized).toContain('id="c-2"');
    expect(serialized).toContain("Second.</rd-comment>");

    const reparsed = parseAnnotatedHtml(serialized);
    expect(reparsed.comments.map((entry) => entry.id)).toEqual(["c-2"]);
    expect(reparsed.warnings).toEqual([]);
  });
});

describe("addHtmlComment protected/literal zones", () => {
  const literalThenBody = [
    "<!doctype html>",
    '<html lang="en">',
    "  <body>",
    "    <article>",
    "      <div data-rd-literal>",
    "        Example showing the phrase quick brown fox in a literal block.",
    "      </div>",
    "      <p>The quick brown fox jumps over the lazy dog.</p>",
    "    </article>",
    '    <aside class="rd-review" hidden>',
    "    </aside>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  it("skips occurrences inside data-rd-literal subtrees and keeps the literal block byte-for-byte", () => {
    const doc = parseAnnotatedHtml(literalThenBody);

    const mutated = addHtmlComment(doc, {
      id: "c-fox",
      anchor: { text: "quick brown fox" },
      author: "a@example.com",
      createdAt: "2026-05-23T12:00:00Z",
      body: "Targeting the body occurrence.",
    });
    const serialized = serializeAnnotatedHtml(mutated);

    // The literal block bytes are unchanged (the literal occurrence is NOT wrapped).
    const literalOpen = literalThenBody.indexOf("<div data-rd-literal>");
    const literalClose =
      literalThenBody.indexOf("</div>", literalOpen) + "</div>".length;
    const originalLiteralBlock = literalThenBody.slice(
      literalOpen,
      literalClose,
    );
    expect(serialized).toContain(originalLiteralBlock);

    // The body occurrence is wrapped in the new <mark>.
    expect(serialized).toContain(
      '<p>The <mark data-rd-comment-ids="c-fox">quick brown fox</mark> jumps over the lazy dog.</p>',
    );
  });
});

describe("removeHtmlComment protected/literal zones", () => {
  const literalMarkOnly = [
    "<!doctype html>",
    '<html lang="en">',
    "  <body>",
    "    <article>",
    "      <div data-rd-literal>",
    '        <mark data-rd-comment-ids="c-literal">documentation example</mark>',
    "      </div>",
    "      <p>Plain body content.</p>",
    "    </article>",
    '    <aside class="rd-review" hidden>',
    "      <rd-comment",
    '        id="c-literal"',
    '        data-rd-author="a@example.com"',
    '        data-rd-created-at="2026-05-23T10:00:00Z"',
    '        data-rd-anchor-ids="c-literal"',
    '        data-rd-status="open"',
    "      >Real record with malformed shared id.</rd-comment>",
    "    </aside>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  const literalAndRealMark = [
    "<!doctype html>",
    '<html lang="en">',
    "  <body>",
    "    <article>",
    "      <div data-rd-literal>",
    '        <mark data-rd-comment-ids="c-real">literal sample text</mark>',
    "      </div>",
    '      <p>Real body content: <mark data-rd-comment-ids="c-real">target span</mark>.</p>',
    "    </article>",
    '    <aside class="rd-review" hidden>',
    "      <rd-comment",
    '        id="c-real"',
    '        data-rd-author="a@example.com"',
    '        data-rd-created-at="2026-05-23T10:00:00Z"',
    '        data-rd-anchor-ids="c-real"',
    '        data-rd-status="open"',
    "      >Body.</rd-comment>",
    "    </aside>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  it("does not touch a <mark> inside data-rd-literal when removing a different real comment", () => {
    const otherIdFixture = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <article>",
      "      <div data-rd-literal>",
      '        <mark data-rd-comment-ids="c-other">literal example</mark>',
      "      </div>",
      '      <p>Body <mark data-rd-comment-ids="c-real">target</mark> text.</p>',
      "    </article>",
      '    <aside class="rd-review" hidden>',
      "      <rd-comment",
      '        id="c-real"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T10:00:00Z"',
      '        data-rd-anchor-ids="c-real"',
      '        data-rd-status="open"',
      "      >Body.</rd-comment>",
      "    </aside>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(otherIdFixture);

    const mutated = removeHtmlComment(doc, { id: "c-real" });
    const serialized = serializeAnnotatedHtml(mutated);

    // The literal mark is preserved byte-for-byte.
    expect(serialized).toContain(
      '<mark data-rd-comment-ids="c-other">literal example</mark>',
    );

    // The real anchor mark has been unwrapped (it was the only real anchor for c-real).
    expect(serialized).toContain("<p>Body target text.</p>");

    // The real record is gone.
    expect(serialized).not.toContain('id="c-real"');
  });

  it("preserves literal mark bytes even when its data-rd-comment-ids id collides with the comment being removed", () => {
    const doc = parseAnnotatedHtml(literalMarkOnly);

    const mutated = removeHtmlComment(doc, { id: "c-literal" });
    const serialized = serializeAnnotatedHtml(mutated);

    // The literal mark survives byte-for-byte even though its id matches.
    expect(serialized).toContain(
      '<mark data-rd-comment-ids="c-literal">documentation example</mark>',
    );

    // The real record is gone.
    expect(serialized).not.toContain('id="c-literal"');
    expect(serialized).not.toContain("Real record with malformed shared id.");
  });

  it("removes the real-body mark while preserving an identically-tagged literal mark", () => {
    const doc = parseAnnotatedHtml(literalAndRealMark);

    const mutated = removeHtmlComment(doc, { id: "c-real" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Literal mark intact.
    expect(serialized).toContain(
      '<mark data-rd-comment-ids="c-real">literal sample text</mark>',
    );

    // Real body mark is unwrapped.
    expect(serialized).toContain("<p>Real body content: target span.</p>");

    // Real record is gone.
    expect(serialized).not.toContain('id="c-real"');
    expect(serialized).not.toContain(">Body.</rd-comment>");
  });

  it("ignores rd-comment records inside data-rd-literal and removes the real review record only", () => {
    const literalRecordBeforeReal = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <article>",
      "      <div data-rd-literal>",
      '        <rd-comment id="c-real" data-rd-author="docs@example.com" data-rd-created-at="2026-05-23T09:00:00Z" data-rd-anchor-ids="c-real" data-rd-status="open">literal fake</rd-comment>',
      "      </div>",
      '      <p>Real body: <mark data-rd-comment-ids="c-real">target</mark>.</p>',
      "    </article>",
      '    <aside class="rd-review" hidden>',
      "      <rd-comment",
      '        id="c-real"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T10:00:00Z"',
      '        data-rd-anchor-ids="c-real"',
      '        data-rd-status="open"',
      "      >real body</rd-comment>",
      "    </aside>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(literalRecordBeforeReal);

    const literalOpen = literalRecordBeforeReal.indexOf(
      "<div data-rd-literal>",
    );
    const literalClose =
      literalRecordBeforeReal.indexOf("</div>", literalOpen) + "</div>".length;
    const originalLiteralBlock = literalRecordBeforeReal.slice(
      literalOpen,
      literalClose,
    );

    const mutated = removeHtmlComment(doc, { id: "c-real" });
    const serialized = serializeAnnotatedHtml(mutated);

    // Literal block bytes unchanged.
    expect(serialized).toContain(originalLiteralBlock);

    // The real anchor mark is unwrapped.
    expect(serialized).toContain("<p>Real body: target.</p>");

    // The real review record is gone (the only remaining rd-comment is the literal one).
    expect(serialized).not.toContain(">real body</rd-comment>");
    const realRecordIdx = serialized.indexOf('<aside class="rd-review"');
    expect(realRecordIdx).toBeGreaterThan(-1);
    const asideTail = serialized.slice(realRecordIdx);
    expect(asideTail).not.toContain('id="c-real"');
  });
});

describe("editHtmlComment protected/literal zones", () => {
  it("ignores rd-comment records inside data-rd-literal and edits the real review record only", () => {
    const literalRecordBeforeReal = [
      "<!doctype html>",
      '<html lang="en">',
      "  <body>",
      "    <article>",
      "      <div data-rd-literal>",
      '        <rd-comment id="c-real" data-rd-author="docs@example.com" data-rd-created-at="2026-05-23T09:00:00Z" data-rd-anchor-ids="c-real" data-rd-status="open">literal fake</rd-comment>',
      "      </div>",
      "      <p>Real body content.</p>",
      "    </article>",
      '    <aside class="rd-review" hidden>',
      "      <rd-comment",
      '        id="c-real"',
      '        data-rd-author="a@example.com"',
      '        data-rd-created-at="2026-05-23T10:00:00Z"',
      '        data-rd-anchor-ids="c-real"',
      '        data-rd-status="open"',
      "      >real body</rd-comment>",
      "    </aside>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const doc = parseAnnotatedHtml(literalRecordBeforeReal);

    const literalOpen = literalRecordBeforeReal.indexOf(
      "<div data-rd-literal>",
    );
    const literalClose =
      literalRecordBeforeReal.indexOf("</div>", literalOpen) + "</div>".length;
    const originalLiteralBlock = literalRecordBeforeReal.slice(
      literalOpen,
      literalClose,
    );

    const mutated = editHtmlComment(doc, {
      id: "c-real",
      body: "updated real body",
    });
    const serialized = serializeAnnotatedHtml(mutated);

    // Literal block bytes unchanged.
    expect(serialized).toContain(originalLiteralBlock);

    // The literal fake body remains, the real record body is updated.
    expect(serialized).toContain(">literal fake</rd-comment>");
    expect(serialized).toContain(">updated real body</rd-comment>");
    expect(serialized).not.toContain(">real body</rd-comment>");
  });
});
