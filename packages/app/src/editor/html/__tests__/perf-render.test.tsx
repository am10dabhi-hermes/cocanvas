import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAnnotatedHtml } from "@roughdraft/rfm";
import { HtmlReadonlyView } from "../HtmlReadonlyView";

// Render budget for the read-only HTML view. Measured locally at ~10-30 ms
// per mount in jsdom for the mixed-review fixture. Budget allows ample CI
// headroom and only catches order-of-magnitude regressions.
const RENDER_BUDGET_MS = 750;

// Inline copy of .context/fixtures/html/mixed-review-document.html. Kept in
// sync intentionally; this test does not depend on node:fs so it builds under
// the app's browser-only tsconfig.
const MIXED_REVIEW_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mixed review document</title>
  </head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>
        Revenue grew
        <mark data-rd-comment-ids="c-rev-1">
          <ins data-rd-suggestion-id="s-rev-1" data-rd-author="a@x" data-rd-created-at="2026-05-23T12:00:00Z">12%</ins></mark>
        quarter over quarter.
      </p>
      <p>
        Churn was
        <del data-rd-suggestion-id="s-churn-1" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:01:00Z">high</del><ins data-rd-suggestion-id="s-churn-1" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:01:00Z">elevated but stable</ins>
        in the SMB segment.
      </p>
      <p>
        We expanded the team in
        <mark data-rd-comment-ids="c-team-1 c-team-2">Berlin and Bangalore</mark>.
      </p>
      <h2>Risks</h2>
      <ul>
        <li>
          <mark data-rd-comment-ids="c-risk-1">Latency in the EU region.</mark>
        </li>
        <li>Long onboarding for enterprise customers.</li>
      </ul>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-rev-1" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:00:30Z" data-rd-anchor-ids="c-rev-1" data-rd-status="open">Cite the exact source row.</rd-comment>
      <rd-comment id="c-team-1" data-rd-author="a@x" data-rd-created-at="2026-05-23T12:02:00Z" data-rd-anchor-ids="c-team-1" data-rd-status="open">Mention headcount delta.</rd-comment>
      <rd-comment id="c-team-2" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:02:45Z" data-rd-anchor-ids="c-team-1" data-rd-status="open" data-rd-reply-to="c-team-1">+1, and split by office.</rd-comment>
      <rd-comment id="c-risk-1" data-rd-author="a@x" data-rd-created-at="2026-05-23T12:03:30Z" data-rd-anchor-ids="c-risk-1" data-rd-status="resolved">Fixed in last release.</rd-comment>
    </aside>
  </body>
</html>`;

describe("HtmlReadonlyView performance", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it(`renders the mixed-review fixture under ${RENDER_BUDGET_MS} ms`, () => {
    const doc = parseAnnotatedHtml(MIXED_REVIEW_FIXTURE);

    const start = performance.now();
    act(() => {
      root.render(<HtmlReadonlyView document={doc} />);
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(RENDER_BUDGET_MS);
    expect(
      container.querySelectorAll('[data-testid="comment-anchor"]').length,
    ).toBeGreaterThan(0);
  });
});
