import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callTool } from "./mcp";

const noopFetch: typeof fetch = async () => {
  throw new Error("fetch should not be called for HTML MCP tools");
};

const PLAIN = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Plain document</title>
  </head>
  <body>
    <article>
      <h1>Plain document</h1>
      <p>This is a paragraph of plain text.</p>
    </article>
  </body>
</html>
`;

const MIXED = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mixed</title>
  </head>
  <body>
    <article>
      <h1>Quarterly review</h1>
      <p>Revenue grew steadily.</p>
      <p>
        Churn was
        <del data-rd-suggestion-id="s-churn-1" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:01:00Z">high</del><ins data-rd-suggestion-id="s-churn-1" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:01:00Z">elevated but stable</ins>
        in the SMB segment.
      </p>
    </article>
    <aside class="rd-review" hidden>
    </aside>
  </body>
</html>
`;

describe("mcp html tools", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-mcp-html-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  describe("read_html_document", () => {
    it("returns a parsed model for plain HTML", async () => {
      const docPath = path.join(projectDir, "plain.html");
      fs.writeFileSync(docPath, PLAIN);

      const result = (await callTool(
        "roughdraft_read_html_document",
        { documentPath: docPath },
        {},
        noopFetch,
      )) as {
        documentPath: string;
        document: {
          format: string;
          comments: unknown[];
          suggestions: unknown[];
        };
        checksum: string;
        sanitizerWarnings: unknown[];
      };

      expect(result.documentPath).toBe(docPath);
      expect(result.document.format).toBe("annotated-html");
      expect(result.document.comments).toHaveLength(0);
      expect(result.document.suggestions).toHaveLength(0);
      expect(typeof result.checksum).toBe("string");
      expect(result.checksum.length).toBeGreaterThan(0);
    });

    it("returns comments and suggestions for an annotated HTML doc", async () => {
      const docPath = path.join(projectDir, "mixed.html");
      fs.writeFileSync(docPath, MIXED);

      const result = (await callTool(
        "roughdraft_read_html_document",
        { documentPath: docPath },
        {},
        noopFetch,
      )) as {
        document: {
          comments: Array<{ id: string }>;
          suggestions: Array<{ id: string; kind: string }>;
        };
      };

      expect(result.document.suggestions.length).toBe(1);
      expect(result.document.suggestions[0]?.id).toBe("s-churn-1");
      expect(result.document.suggestions[0]?.kind).toBe("substitution");
    });

    it("rejects non-html extensions", async () => {
      const docPath = path.join(projectDir, "notes.md");
      fs.writeFileSync(docPath, "# Notes\n");

      await expect(
        callTool(
          "roughdraft_read_html_document",
          { documentPath: docPath },
          {},
          noopFetch,
        ),
      ).rejects.toThrow(/\.html?\s*files?/i);
    });

    it("rejects paths outside the configured root", async () => {
      const outsideDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "roughdraft-outside-"),
      );
      const outsidePath = path.join(outsideDir, "outside.html");
      fs.writeFileSync(outsidePath, PLAIN);

      try {
        await expect(
          callTool(
            "roughdraft_read_html_document",
            { documentPath: outsidePath, projectRoot: projectDir },
            {},
            noopFetch,
          ),
        ).rejects.toThrow(/outside.*root/i);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it("rejects paths that try to traverse out of the configured root", async () => {
      const docPath = path.join(projectDir, "page.html");
      fs.writeFileSync(docPath, PLAIN);

      await expect(
        callTool(
          "roughdraft_read_html_document",
          { documentPath: "../outside.html", projectRoot: projectDir },
          {},
          noopFetch,
        ),
      ).rejects.toThrow(/outside.*root/i);
    });
  });

  describe("add_comment", () => {
    it("wraps the anchor text with a mark and inserts an rd-comment record", async () => {
      const docPath = path.join(projectDir, "doc.html");
      fs.writeFileSync(docPath, PLAIN);
      const before = fs.readFileSync(docPath, "utf8");

      const result = (await callTool(
        "roughdraft_add_comment",
        {
          documentPath: docPath,
          id: "c-mcp-1",
          anchorText: "plain text",
          author: "agent@example.com",
          createdAt: "2026-05-23T18:00:00Z",
          body: "Tighten this phrase.",
        },
        {},
        noopFetch,
      )) as { documentPath: string; commentId: string };

      expect(result.commentId).toBe("c-mcp-1");
      const after = fs.readFileSync(docPath, "utf8");
      expect(after).not.toBe(before);
      expect(after).toContain('data-rd-comment-ids="c-mcp-1"');
      expect(after).toContain("<rd-comment");
      expect(after).toContain("Tighten this phrase.");
      expect(after).toContain(
        '<mark data-rd-comment-ids="c-mcp-1">plain text</mark>',
      );
    });

    it("rejects an anchor selector that matches zero nodes", async () => {
      const docPath = path.join(projectDir, "doc.html");
      fs.writeFileSync(docPath, PLAIN);

      await expect(
        callTool(
          "roughdraft_add_comment",
          {
            documentPath: docPath,
            id: "c-miss",
            anchorText: "not present anywhere",
            author: "agent@example.com",
            createdAt: "2026-05-23T18:00:00Z",
            body: "x",
          },
          {},
          noopFetch,
        ),
      ).rejects.toThrow(/not found|anchor/i);
    });

    it("rejects when anchor occurrence is ambiguous and no occurrence is specified", async () => {
      const docPath = path.join(projectDir, "doc.html");
      fs.writeFileSync(
        docPath,
        `<!doctype html><html><head><title>T</title></head><body>` +
          `<article><p>alpha alpha alpha</p></article>` +
          `</body></html>`,
      );

      await expect(
        callTool(
          "roughdraft_add_comment",
          {
            documentPath: docPath,
            id: "c-amb",
            anchorText: "alpha",
            author: "agent@example.com",
            createdAt: "2026-05-23T18:00:00Z",
            body: "x",
            requireUnique: true,
          },
          {},
          noopFetch,
        ),
      ).rejects.toThrow(/ambiguous|multiple/i);
    });

    it("supports occurrence to disambiguate", async () => {
      const docPath = path.join(projectDir, "doc.html");
      fs.writeFileSync(
        docPath,
        `<!doctype html><html><head><title>T</title></head><body>` +
          `<article><p>alpha alpha alpha</p></article>` +
          `</body></html>`,
      );

      await callTool(
        "roughdraft_add_comment",
        {
          documentPath: docPath,
          id: "c-occ2",
          anchorText: "alpha",
          occurrence: 2,
          author: "agent@example.com",
          createdAt: "2026-05-23T18:00:00Z",
          body: "second one",
        },
        {},
        noopFetch,
      );

      const after = fs.readFileSync(docPath, "utf8");
      expect(after).toContain(
        '<mark data-rd-comment-ids="c-occ2">alpha</mark>',
      );
    });
  });

  describe("accept_suggestion / reject_suggestion", () => {
    it("accept replaces a substitution with the ins content", async () => {
      const docPath = path.join(projectDir, "mixed.html");
      fs.writeFileSync(docPath, MIXED);

      const result = (await callTool(
        "roughdraft_accept_suggestion",
        { documentPath: docPath, id: "s-churn-1" },
        {},
        noopFetch,
      )) as { documentPath: string };

      expect(result.documentPath).toBe(docPath);
      const after = fs.readFileSync(docPath, "utf8");
      expect(after).toContain("elevated but stable");
      expect(after).not.toContain('data-rd-suggestion-id="s-churn-1"');
      expect(after).not.toContain('<del data-rd-suggestion-id="s-churn-1"');
    });

    it("reject restores the del content for a substitution", async () => {
      const docPath = path.join(projectDir, "mixed.html");
      fs.writeFileSync(docPath, MIXED);

      await callTool(
        "roughdraft_reject_suggestion",
        { documentPath: docPath, id: "s-churn-1" },
        {},
        noopFetch,
      );

      const after = fs.readFileSync(docPath, "utf8");
      expect(after).toMatch(/\bhigh\b/);
      expect(after).not.toContain("elevated but stable");
      expect(after).not.toContain('data-rd-suggestion-id="s-churn-1"');
    });

    it("both refuse an unknown suggestion id", async () => {
      const docPath = path.join(projectDir, "mixed.html");
      fs.writeFileSync(docPath, MIXED);

      await expect(
        callTool(
          "roughdraft_accept_suggestion",
          { documentPath: docPath, id: "s-does-not-exist" },
          {},
          noopFetch,
        ),
      ).rejects.toThrow(/not found/i);

      await expect(
        callTool(
          "roughdraft_reject_suggestion",
          { documentPath: docPath, id: "s-does-not-exist" },
          {},
          noopFetch,
        ),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("end-to-end agent flow", () => {
    it("read -> add comment -> accept suggestion -> re-read", async () => {
      const docPath = path.join(projectDir, "flow.html");
      fs.writeFileSync(docPath, MIXED);

      const initial = (await callTool(
        "roughdraft_read_html_document",
        { documentPath: docPath },
        {},
        noopFetch,
      )) as {
        document: {
          suggestions: Array<{ id: string }>;
          comments: Array<{ id: string }>;
        };
      };
      expect(initial.document.suggestions).toHaveLength(1);
      expect(initial.document.comments).toHaveLength(0);

      await callTool(
        "roughdraft_add_comment",
        {
          documentPath: docPath,
          id: "c-flow-1",
          anchorText: "Revenue grew",
          author: "agent@example.com",
          createdAt: "2026-05-23T19:00:00Z",
          body: "Add the percentage.",
        },
        {},
        noopFetch,
      );

      await callTool(
        "roughdraft_accept_suggestion",
        { documentPath: docPath, id: "s-churn-1" },
        {},
        noopFetch,
      );

      const final = (await callTool(
        "roughdraft_read_html_document",
        { documentPath: docPath },
        {},
        noopFetch,
      )) as {
        document: {
          suggestions: Array<{ id: string }>;
          comments: Array<{ id: string }>;
        };
      };
      expect(final.document.suggestions).toHaveLength(0);
      expect(final.document.comments.some((c) => c.id === "c-flow-1")).toBe(
        true,
      );
      const onDisk = fs.readFileSync(docPath, "utf8");
      expect(onDisk).toContain("elevated but stable");
      expect(onDisk).toContain('data-rd-comment-ids="c-flow-1"');
    });
  });
});
