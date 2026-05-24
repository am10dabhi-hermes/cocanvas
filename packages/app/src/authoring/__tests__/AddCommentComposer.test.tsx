import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddCommentComposer } from "../AddCommentComposer";

describe("AddCommentComposer", () => {
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

  it("renders the selected anchor text", async () => {
    await act(async () => {
      root.render(
        <AddCommentComposer
          open
          selectedText="Revenue grew"
          onSubmit={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="add-comment-composer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="add-comment-selected-text"]')
        ?.textContent,
    ).toContain("Revenue grew");
  });

  it("renders nothing when not open", async () => {
    await act(async () => {
      root.render(
        <AddCommentComposer
          open={false}
          selectedText="x"
          onSubmit={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="add-comment-composer"]'),
    ).toBeNull();
  });

  it("disables Save when body is empty or whitespace", async () => {
    await act(async () => {
      root.render(
        <AddCommentComposer
          open
          selectedText="x"
          onSubmit={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    const save = container.querySelector(
      '[data-testid="add-comment-save"]',
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("submits the trimmed body via onSubmit", async () => {
    const onSubmit = vi.fn();
    await act(async () => {
      root.render(
        <AddCommentComposer
          open
          selectedText="anchor"
          onSubmit={onSubmit}
          onCancel={() => {}}
        />,
      );
    });

    const textarea = container.querySelector(
      '[data-testid="add-comment-body"]',
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "  Please cite source.  ");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = container.querySelector(
      '[data-testid="add-comment-save"]',
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    await act(async () => {
      save.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ body: "Please cite source." });
  });

  it("calls onCancel when Cancel is pressed", async () => {
    const onCancel = vi.fn();
    await act(async () => {
      root.render(
        <AddCommentComposer
          open
          selectedText="x"
          onSubmit={() => {}}
          onCancel={onCancel}
        />,
      );
    });

    const cancel = container.querySelector(
      '[data-testid="add-comment-cancel"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancel.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
