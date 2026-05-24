import { afterEach, describe, expect, it } from "vitest";
import {
  PREVIEW_PATH,
  ROUGHDRAFT_FLAVORED_MARKDOWN_PATH,
  buildLocationForLinkedMarkdownDocument,
  getRequestedPathState,
  syncRequestedPathInUrl,
} from "./app-navigation";

describe("app navigation", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("reads absolute markdown paths from the path query parameter", () => {
    window.history.replaceState(
      null,
      "",
      "/?path=%2FUsers%2Fme%2F.claude%2Fplans%2Fexample.md",
    );

    expect(getRequestedPathState()).toEqual({
      rawPath: "/Users/me/.claude/plans/example.md",
      projectPath: "/Users/me/.claude/plans",
      documentPath: "example.md",
      documentKind: "markdown",
    });
  });

  it("keeps absolute paths in the path query parameter", () => {
    window.history.replaceState(null, "", "/");

    syncRequestedPathInUrl("/Users/me/.claude/plans/example.md");

    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe(
      "?path=%2FUsers%2Fme%2F.claude%2Fplans%2Fexample.md",
    );
  });

  it("does not treat reserved app pages as file paths", () => {
    window.history.replaceState(null, "", ROUGHDRAFT_FLAVORED_MARKDOWN_PATH);

    expect(getRequestedPathState()).toEqual({
      rawPath: null,
      projectPath: null,
      documentPath: null,
      documentKind: null,
    });

    window.history.replaceState(null, "", PREVIEW_PATH);

    expect(getRequestedPathState()).toEqual({
      rawPath: null,
      projectPath: null,
      documentPath: null,
      documentKind: null,
    });
  });

  it("recognizes .html paths", () => {
    window.history.replaceState(
      null,
      "",
      "/?path=%2FUsers%2Fme%2Fdocs%2Freport.html",
    );

    expect(getRequestedPathState()).toEqual({
      rawPath: "/Users/me/docs/report.html",
      projectPath: "/Users/me/docs",
      documentPath: "report.html",
      documentKind: "html",
    });
  });

  it("recognizes .htm paths", () => {
    window.history.replaceState(
      null,
      "",
      "/?path=%2FUsers%2Fme%2Fdocs%2Flegacy.htm",
    );

    expect(getRequestedPathState()).toEqual({
      rawPath: "/Users/me/docs/legacy.htm",
      projectPath: "/Users/me/docs",
      documentPath: "legacy.htm",
      documentKind: "html",
    });
  });

  it("builds Roughdraft routes for linked markdown documents", () => {
    window.history.replaceState(
      null,
      "",
      "/?path=%2FUsers%2Fme%2Fproject%2F.context%2Flocal-link-source.md",
    );

    expect(
      buildLocationForLinkedMarkdownDocument({
        projectPath: "/Users/me/project/.context",
        currentDocumentPath: "local-link-source.md",
        href: "local-link-target.md",
      }),
    ).toBe("/?path=%2FUsers%2Fme%2Fproject%2F.context%2Flocal-link-target.md");
  });

  it("resolves nested markdown links relative to the current document", () => {
    window.history.replaceState(null, "", "/");

    expect(
      buildLocationForLinkedMarkdownDocument({
        projectPath: "/Users/me/project",
        currentDocumentPath: "notes/source.md",
        href: "../index.md#summary",
      }),
    ).toBe("/?path=%2FUsers%2Fme%2Fproject%2Findex.md#summary");
  });

  it("leaves non-markdown links for the file resolver", () => {
    expect(
      buildLocationForLinkedMarkdownDocument({
        projectPath: "/Users/me/project",
        currentDocumentPath: "source.md",
        href: "diagram.png",
      }),
    ).toBeNull();
  });
});
