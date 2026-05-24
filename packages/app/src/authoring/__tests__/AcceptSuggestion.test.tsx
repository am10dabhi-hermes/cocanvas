import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptHtmlSuggestion, parseAnnotatedHtml } from "@roughdraft/rfm";
import { AcceptSuggestion } from "../SuggestionActions";

const SUGGESTIONS_HTML = `<!doctype html>
<html lang="en"><head><title>S</title></head>
<body>
  <article>
    <p>
      We shipped
      <ins data-rd-suggestion-id="s-1" data-rd-author="a" data-rd-created-at="2026-05-23T11:00:00Z" data-rd-status="open">three new</ins>
      features this week.
    </p>
    <p>
      We will replace
      <del data-rd-suggestion-id="s-3" data-rd-author="a" data-rd-created-at="2026-05-23T11:02:30Z">the legacy parser</del><ins data-rd-suggestion-id="s-3" data-rd-author="a" data-rd-created-at="2026-05-23T11:02:30Z">the new streaming parser</ins>
      next sprint.
    </p>
  </article>
</body></html>`;

describe("AcceptSuggestion", () => {
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

  it("renders an Accept button tied to the suggestion id", async () => {
    await act(async () => {
      root.render(<AcceptSuggestion suggestionId="s-1" onAccept={() => {}} />);
    });
    const button = container.querySelector(
      '[data-testid="suggestion-accept"][data-suggestion-id="s-1"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
  });

  it("calls onAccept with the suggestion id when clicked", async () => {
    const onAccept = vi.fn();
    await act(async () => {
      root.render(<AcceptSuggestion suggestionId="s-1" onAccept={onAccept} />);
    });

    const button = container.querySelector(
      '[data-testid="suggestion-accept"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(onAccept).toHaveBeenCalledWith("s-1");
  });

  it("accept standalone ins removes the ins wrapper and keeps the inserted text", () => {
    const doc = parseAnnotatedHtml(SUGGESTIONS_HTML);
    const next = acceptHtmlSuggestion(doc, { id: "s-1" });
    expect(next.source).toContain("We shipped\n      three new\n");
    expect(next.source).not.toContain('data-rd-suggestion-id="s-1"');
    // The other suggestion is left alone.
    expect(next.source).toContain('data-rd-suggestion-id="s-3"');
  });

  it("accept substitution replaces del+ins with the inserted text", () => {
    const doc = parseAnnotatedHtml(SUGGESTIONS_HTML);
    const next = acceptHtmlSuggestion(doc, { id: "s-3" });
    expect(next.source).toContain("the new streaming parser");
    expect(next.source).not.toContain("the legacy parser");
    expect(next.source).not.toContain('data-rd-suggestion-id="s-3"');
  });
});
