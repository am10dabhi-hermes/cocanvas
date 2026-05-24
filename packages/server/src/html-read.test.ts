import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./index";

const COMMENTED_FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Commented document</title>
  </head>
  <body>
    <article>
      <h1>The weather report</h1>
      <p>
        The
        <mark data-rd-comment-ids="c-7uG2">sky</mark>
        is blue today.
      </p>
    </article>
    <aside class="rd-review" hidden>
      <rd-comment
        id="c-7uG2"
        data-rd-author="ananth@cradlewise.com"
        data-rd-created-at="2026-05-23T10:14:11Z"
        data-rd-anchor-ids="c-7uG2"
        data-rd-status="open"
      >Consider saying clear sky for accuracy.</rd-comment>
    </aside>
  </body>
</html>`;

describe("GET /api/html-file", () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-html-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-html-home-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("reads a plain .html file and returns a parsed model", async () => {
    fs.writeFileSync(
      path.join(projectDir, "plain.html"),
      `<!doctype html><html><head><title>Plain doc</title></head>` +
        `<body><article><h1>Heading</h1><p>Body.</p></article></body></html>`,
    );

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "plain.html",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "plain",
      title: "Plain doc",
    });
    expect(typeof response.body.content).toBe("string");
    expect(response.body.version).toEqual(expect.any(String));
    expect(response.body.document).toBeDefined();
    expect(response.body.document.format).toBe("annotated-html");
    expect(response.body.document.source).toBe(response.body.content);
    expect(Array.isArray(response.body.sanitizerWarnings)).toBe(true);
    expect(response.body.sanitizerWarnings).toHaveLength(0);
  });

  it("reads a commented .html file and returns model with comments", async () => {
    fs.writeFileSync(path.join(projectDir, "doc.html"), COMMENTED_FIXTURE);

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "doc.html",
    });

    expect(response.status).toBe(200);
    expect(response.body.document.comments.length).toBeGreaterThan(0);
    const [firstComment] = response.body.document.comments;
    expect(firstComment).toMatchObject({
      id: "c-7uG2",
      author: "ananth@cradlewise.com",
    });
    expect(firstComment.body).toContain("clear sky");
    expect(firstComment.anchorIds).toContain("c-7uG2");
  });

  it("accepts .htm extension and strips it from the id", async () => {
    fs.writeFileSync(
      path.join(projectDir, "legacy.htm"),
      `<!doctype html><html><body><h1>Legacy</h1></body></html>`,
    );

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "legacy.htm",
    });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("legacy");
    expect(response.body.title).toBe("Legacy");
  });

  it("falls back to <h1> when there is no <title>", async () => {
    fs.writeFileSync(
      path.join(projectDir, "h1-only.html"),
      `<!doctype html><html><body><article><h1>Just an H1</h1></article></body></html>`,
    );

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "h1-only.html",
    });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Just an H1");
  });

  it("uses basename as title when no <title> or <h1>", async () => {
    fs.writeFileSync(
      path.join(projectDir, "bare.html"),
      `<!doctype html><html><body><p>No title or heading.</p></body></html>`,
    );

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "bare.html",
    });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("bare");
  });

  it("rejects non-html extensions with 400", async () => {
    fs.writeFileSync(path.join(projectDir, "notes.md"), "# Notes\n");

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "notes.md",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "HTML file path must end with .html or .htm",
    });
  });

  it("applies sanitizer on read and exposes warnings", async () => {
    const malicious =
      `<!doctype html><html><head><title>Mal</title></head><body>` +
      `<p onclick="alert(1)">hello</p>` +
      `<script>alert('xss')</script>` +
      `<a href="javascript:alert(1)">bad</a>` +
      `</body></html>`;
    fs.writeFileSync(path.join(projectDir, "mal.html"), malicious);

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "mal.html",
    });

    expect(response.status).toBe(200);
    expect(response.body.content).not.toContain("onclick");
    expect(response.body.content).not.toContain("<script");
    expect(response.body.content).not.toContain("javascript:");
    expect(response.body.document.source).toBe(response.body.content);

    const codes = (
      response.body.sanitizerWarnings as Array<{ code: string }>
    ).map((warning) => warning.code);
    expect(codes).toContain("disallowed-attribute");
    expect(codes).toContain("disallowed-element");
    expect(codes).toContain("disallowed-url");
  });

  it("returns 404 when the html file is missing", async () => {
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "missing.html",
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "HTML file not found" });
  });

  it("normalizes nested path ids with forward slashes", async () => {
    const nestedDir = path.join(projectDir, "section", "sub");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, "page.html"),
      `<!doctype html><html><head><title>Nested</title></head><body><p>x</p></body></html>`,
    );

    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app).get("/api/html-file").query({
      projectPath: projectDir,
      path: "section/sub/page.html",
    });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe("section/sub/page");
    expect(response.body.title).toBe("Nested");
  });
});
