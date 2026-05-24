import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAnnotatedHtml } from "@roughdraft/rfm";
import { HtmlReadonlyView } from "../HtmlReadonlyView";

const MIXED_REVIEW_FIXTURE = `<!doctype html>
<html lang="en">
  <head><title>Mixed review document</title></head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>
        Revenue grew
        <mark data-rd-comment-ids="c-rev-1">
          <ins data-rd-suggestion-id="s-rev-1">12%</ins></mark>
        quarter over quarter.
      </p>
      <p>
        Churn was
        <del data-rd-suggestion-id="s-churn-1">high</del><ins data-rd-suggestion-id="s-churn-1">elevated but stable</ins>
        in the SMB segment.
      </p>
      <p>
        We expanded the team in
        <mark data-rd-comment-ids="c-team-1 c-team-2">Berlin and Bangalore</mark>.
      </p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-rev-1" data-rd-anchor-ids="c-rev-1" data-rd-status="open">Cite the exact source row.</rd-comment>
      <rd-comment id="c-team-1" data-rd-anchor-ids="c-team-1" data-rd-status="open">Mention headcount delta.</rd-comment>
      <rd-comment id="c-team-2" data-rd-anchor-ids="c-team-1" data-rd-status="open" data-rd-reply-to="c-team-1">+1 and split by office.</rd-comment>
    </aside>
  </body>
</html>`;

describe("HtmlReadonlyView", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
  });

  it("renders mixed-review fixture without console errors", async () => {
    const doc = parseAnnotatedHtml(MIXED_REVIEW_FIXTURE);

    await act(async () => {
      root.render(<HtmlReadonlyView document={doc} />);
    });

    expect(container.textContent).toContain("Quarterly review");
    expect(container.textContent).toContain("Revenue grew");
    expect(container.textContent).toContain("Berlin and Bangalore");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('renders mark elements with data-testid="comment-anchor"', async () => {
    const doc = parseAnnotatedHtml(MIXED_REVIEW_FIXTURE);

    await act(async () => {
      root.render(<HtmlReadonlyView document={doc} />);
    });

    const anchors = container.querySelectorAll(
      '[data-testid="comment-anchor"]',
    );
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    const anchorIds = Array.from(anchors).map((anchor) =>
      anchor.getAttribute("data-rd-comment-ids"),
    );
    expect(anchorIds).toContain("c-rev-1");
    expect(anchorIds).toContain("c-team-1 c-team-2");
  });

  it("disables contentEditable in this mode", async () => {
    const doc = parseAnnotatedHtml(MIXED_REVIEW_FIXTURE);

    await act(async () => {
      root.render(<HtmlReadonlyView document={doc} />);
    });

    const view = container.querySelector(
      '[data-testid="html-readonly-view"]',
    ) as HTMLElement | null;
    expect(view).not.toBeNull();
    expect(view?.getAttribute("contenteditable")).toBe("false");
  });

  it("does not render the rd-review aside or rd-comment records inline", async () => {
    const doc = parseAnnotatedHtml(MIXED_REVIEW_FIXTURE);

    await act(async () => {
      root.render(<HtmlReadonlyView document={doc} />);
    });

    expect(container.innerHTML).not.toContain('class="rd-review"');
    expect(container.innerHTML).not.toContain("<rd-comment");
    expect(container.textContent).not.toContain("Cite the exact source row.");
  });
});
