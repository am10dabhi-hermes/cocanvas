import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAnnotatedHtml } from "@roughdraft/rfm";
import { HtmlDocumentWorkspace } from "../HtmlDocumentWorkspace";

const SOURCE = `<!doctype html>
<html lang="en">
  <head><title>Workspace fixture</title></head>
  <body>
    <article>
      <h1>Heading</h1>
      <p>
        Revenue grew
        <mark data-rd-comment-ids="c-rev-1">12%</mark>
        quarter over quarter.
      </p>
      <p>
        Team in
        <mark data-rd-comment-ids="c-team-1">Berlin and Bangalore</mark>.
      </p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment id="c-rev-1" data-rd-anchor-ids="c-rev-1" data-rd-status="open" data-rd-author="reviewer">Cite the source.</rd-comment>
      <rd-comment id="c-team-1" data-rd-anchor-ids="c-team-1" data-rd-status="open" data-rd-author="reviewer">Mention headcount delta.</rd-comment>
    </aside>
  </body>
</html>`;

function buildResponse() {
  const document = parseAnnotatedHtml(SOURCE);
  return {
    id: "workspace",
    title: "Workspace fixture",
    content: SOURCE,
    version: "v-1",
    document,
    sanitizerWarnings: [],
  };
}

describe("HtmlDocumentWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const responsePayload = buildResponse();
    fetchSpy = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  async function renderWorkspace(
    options: {
      documentPath?: string;
      projectPath?: string | null;
      absolutePath?: string | null;
    } = {},
  ) {
    await act(async () => {
      root.render(
        <HtmlDocumentWorkspace
          documentPath={options.documentPath ?? "doc.html"}
          projectPath={options.projectPath ?? "/tmp/project"}
          absolutePath={options.absolutePath ?? "/tmp/project/doc.html"}
        />,
      );
    });
    // resolve fetch + state update
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("fetches /api/html-file with path and projectPath", async () => {
    await renderWorkspace({
      documentPath: "nested/page.html",
      projectPath: "/tmp/projectX",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledWith = fetchSpy.mock.calls[0]?.[0] as string;
    expect(calledWith).toContain("/api/html-file");
    expect(calledWith).toContain("path=nested%2Fpage.html");
    expect(calledWith).toContain("projectPath=%2Ftmp%2FprojectX");
  });

  it("renders title, document content, anchors, and review rail", async () => {
    await renderWorkspace();

    expect(
      container
        .querySelector('[data-testid="html-document-workspace"]')
        ?.getAttribute("data-state"),
    ).toBe("loaded");
    expect(container.textContent).toContain("Workspace fixture");
    expect(container.textContent).toContain("Heading");
    expect(container.textContent).toContain("Revenue grew");

    const anchors = container.querySelectorAll(
      '[data-testid="comment-anchor"]',
    );
    expect(anchors.length).toBeGreaterThanOrEqual(2);

    expect(
      container.querySelector('[data-testid="html-review-rail"]'),
    ).not.toBeNull();
    const cards = container.querySelectorAll(
      '[data-testid="html-review-card"]',
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("syncs clicks between anchors and rail cards", async () => {
    await renderWorkspace();

    const anchor = container.querySelector(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-rev-1"]',
    ) as HTMLElement;
    expect(anchor).not.toBeNull();

    await act(async () => {
      anchor.click();
    });

    const card = container.querySelector(
      '[data-card-id="c-rev-1"]',
    ) as HTMLElement;
    expect(card.getAttribute("data-active")).toBe("true");
    expect(anchor.getAttribute("data-active")).toBe("true");

    const otherCard = container.querySelector(
      '[data-card-id="c-team-1"]',
    ) as HTMLElement;
    await act(async () => {
      otherCard.click();
    });

    expect(otherCard.getAttribute("data-active")).toBe("true");
    const otherAnchor = container.querySelector(
      '[data-testid="comment-anchor"][data-rd-comment-ids="c-team-1"]',
    ) as HTMLElement;
    expect(otherAnchor.getAttribute("data-active")).toBe("true");
  });

  it("shows an error state when the fetch fails", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("nope", { status: 404 }) as unknown as Response,
    );

    await renderWorkspace();

    expect(
      container
        .querySelector('[data-testid="html-document-workspace"]')
        ?.getAttribute("data-state"),
    ).toBe("error");
  });
});
