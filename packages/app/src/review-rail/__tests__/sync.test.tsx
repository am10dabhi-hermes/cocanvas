import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAnnotatedHtml } from "@roughdraft/rfm";
import { HtmlReadonlyView } from "../../editor/html/HtmlReadonlyView";
import { HtmlReviewRail } from "../HtmlReviewRail";
import { useHtmlReviewRailSync } from "../sync";

const FIXTURE = `<!doctype html>
<html lang="en">
  <head><title>Sync fixture</title></head>
  <body>
    <article>
      <p>
        Revenue grew
        <mark data-rd-comment-ids="c-rev-1">12%</mark>
        quarter over quarter.
      </p>
      <p>
        We expanded the team in
        <mark data-rd-comment-ids="c-team-1">Berlin and Bangalore</mark>.
      </p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-rev-1" data-rd-anchor-ids="c-rev-1" data-rd-status="open">Cite the exact source row.</rd-comment>
      <rd-comment id="c-team-1" data-rd-anchor-ids="c-team-1" data-rd-status="open">Mention headcount delta.</rd-comment>
      <rd-comment id="c-team-2" data-rd-anchor-ids="c-team-1" data-rd-status="open" data-rd-reply-to="c-team-1">+1 and split by office.</rd-comment>
    </aside>
  </body>
</html>`;

function HtmlReviewWorkspace() {
  const doc = parseAnnotatedHtml(FIXTURE);
  const sync = useHtmlReviewRailSync();
  return (
    <div>
      <HtmlReadonlyView
        document={doc}
        activeAnchorId={sync.activeAnchorId}
        onAnchorActivate={sync.handleAnchorActivate}
        anchorRefs={sync.anchorRefs}
      />
      <HtmlReviewRail
        comments={doc.comments}
        suggestions={doc.suggestions}
        activeCardId={sync.activeCardId}
        onCardActivate={sync.handleCardActivate}
        cardRefs={sync.cardRefs}
      />
    </div>
  );
}

describe("useHtmlReviewRailSync", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    if (
      typeof (HTMLElement.prototype as { scrollIntoView?: () => void })
        .scrollIntoView !== "function"
    ) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(<HtmlReviewWorkspace />);
    });
  }

  it("activates rail card and scrolls it into view when an anchor is clicked", async () => {
    await render();

    const card = container.querySelector(
      '[data-card-id="c-rev-1"]',
    ) as HTMLElement;
    const scrollSpy = vi.spyOn(card, "scrollIntoView");
    const focusSpy = vi.spyOn(card, "focus");

    const anchor = container.querySelector(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-rev-1"]',
    ) as HTMLElement;
    await act(async () => {
      anchor.click();
    });

    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(card.getAttribute("data-active")).toBe("true");
    const anchorActive = container.querySelector(
      '[data-rd-comment-ids="c-rev-1"]',
    ) as HTMLElement;
    expect(anchorActive.getAttribute("data-active")).toBe("true");
  });

  it("activates anchor and scrolls it into view when a rail card is clicked", async () => {
    await render();

    const anchor = container.querySelector(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-team-1"]',
    ) as HTMLElement;
    const scrollSpy = vi.spyOn(anchor, "scrollIntoView");
    const focusSpy = vi.spyOn(anchor, "focus");

    const card = container.querySelector(
      '[data-card-id="c-team-1"]',
    ) as HTMLElement;
    await act(async () => {
      card.click();
    });

    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(card.getAttribute("data-active")).toBe("true");
    expect(anchor.getAttribute("data-active")).toBe("true");
  });

  it("activates a card via Enter and Space keys", async () => {
    await render();

    const card = container.querySelector(
      '[data-card-id="c-rev-1"]',
    ) as HTMLElement;

    await act(async () => {
      card.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(card.getAttribute("data-active")).toBe("true");

    const other = container.querySelector(
      '[data-card-id="c-team-1"]',
    ) as HTMLElement;
    await act(async () => {
      other.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(other.getAttribute("data-active")).toBe("true");
  });

  it("activates an anchor via Enter on the mark", async () => {
    await render();

    const anchor = container.querySelector(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-team-1"]',
    ) as HTMLElement;

    await act(async () => {
      anchor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(anchor.getAttribute("data-active")).toBe("true");
    const card = container.querySelector(
      '[data-card-id="c-team-1"]',
    ) as HTMLElement;
    expect(card.getAttribute("data-active")).toBe("true");
  });
});
