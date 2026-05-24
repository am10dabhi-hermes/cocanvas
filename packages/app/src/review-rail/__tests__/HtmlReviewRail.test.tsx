import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  HtmlAnnotationComment,
  HtmlAnnotationSuggestion,
} from "@roughdraft/rfm";
import { HtmlReviewRail } from "../HtmlReviewRail";

const COMMENTS: HtmlAnnotationComment[] = [
  {
    id: "c-rev-1",
    anchorIds: ["c-rev-1"],
    author: "reviewer@example.com",
    createdAt: "2026-05-23T12:00:30Z",
    updatedAt: null,
    status: "open",
    replyTo: null,
    body: "Cite the exact source row.",
    position: 5,
  },
  {
    id: "c-team-1",
    anchorIds: ["c-team-1"],
    author: "ananth@cradlewise.com",
    createdAt: "2026-05-23T12:02:00Z",
    updatedAt: null,
    status: "open",
    replyTo: null,
    body: "Mention headcount delta.",
    position: 20,
  },
  {
    id: "c-team-2",
    anchorIds: ["c-team-1"],
    author: "reviewer@example.com",
    createdAt: "2026-05-23T12:02:45Z",
    updatedAt: null,
    status: "open",
    replyTo: "c-team-1",
    body: "+1 and split by office.",
    position: 21,
  },
  {
    id: "c-risk-1",
    anchorIds: ["c-risk-1"],
    author: "ananth@cradlewise.com",
    createdAt: "2026-05-23T12:03:30Z",
    updatedAt: null,
    status: "resolved",
    replyTo: null,
    body: "Fixed in last release.",
    position: 40,
  },
];

const SUGGESTIONS: HtmlAnnotationSuggestion[] = [
  {
    id: "s-rev-1",
    kind: "insertion",
    author: "ananth@cradlewise.com",
    createdAt: "2026-05-23T12:00:00Z",
    status: "open",
    insertedText: "12%",
    position: 3,
  },
  {
    id: "s-churn-1",
    kind: "substitution",
    author: "reviewer@example.com",
    createdAt: "2026-05-23T12:01:00Z",
    status: "open",
    deletedText: "high",
    insertedText: "elevated but stable",
    position: 11,
  },
];

describe("HtmlReviewRail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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

  async function render(props: {
    comments: HtmlAnnotationComment[];
    suggestions: HtmlAnnotationSuggestion[];
    activeCardId?: string | null;
    onCardActivate?: (cardId: string) => void;
  }) {
    await act(async () => {
      root.render(<HtmlReviewRail {...props} />);
    });
  }

  it("lists all comments and suggestions in document order", async () => {
    await render({ comments: COMMENTS, suggestions: SUGGESTIONS });

    const rail = container.querySelector('[data-testid="html-review-rail"]');
    expect(rail).not.toBeNull();

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-testid="html-review-card"]',
      ),
    );
    const ids = cards.map((card) => card.getAttribute("data-card-id"));
    expect(ids).toEqual([
      "s-rev-1",
      "c-rev-1",
      "s-churn-1",
      "c-team-1",
      "c-team-2",
      "c-risk-1",
    ]);
  });

  it("renders resolved comments distinctly from open ones", async () => {
    await render({ comments: COMMENTS, suggestions: SUGGESTIONS });

    const resolved = container.querySelector(
      '[data-card-id="c-risk-1"]',
    ) as HTMLElement | null;
    const open = container.querySelector(
      '[data-card-id="c-rev-1"]',
    ) as HTMLElement | null;

    expect(resolved).not.toBeNull();
    expect(open).not.toBeNull();
    expect(resolved?.getAttribute("data-status")).toBe("resolved");
    expect(open?.getAttribute("data-status")).toBe("open");
  });

  it("renders reply threads under their parents", async () => {
    await render({ comments: COMMENTS, suggestions: SUGGESTIONS });

    const parent = container.querySelector(
      '[data-card-id="c-team-1"]',
    ) as HTMLElement | null;
    const reply = container.querySelector(
      '[data-card-id="c-team-2"]',
    ) as HTMLElement | null;

    expect(parent).not.toBeNull();
    expect(reply).not.toBeNull();
    expect(reply?.getAttribute("data-reply-to")).toBe("c-team-1");
    expect(parent?.contains(reply)).toBe(true);
  });

  it("marks the active card via data-active", async () => {
    await render({
      comments: COMMENTS,
      suggestions: SUGGESTIONS,
      activeCardId: "c-team-1",
    });

    const active = container.querySelector(
      '[data-card-id="c-team-1"]',
    ) as HTMLElement | null;
    expect(active?.getAttribute("data-active")).toBe("true");
  });
});
