import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./index";

const PLAIN_HTML = `<!doctype html><html><head><title>Plain doc</title></head><body><article><h1>Heading</h1><p>Body.</p></article></body></html>`;

describe("PUT /api/html-file", () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-html-w-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "roughdraft-html-w-home-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("saves html content when expected version matches", async () => {
    const absolutePath = path.join(projectDir, "doc.html");
    fs.writeFileSync(absolutePath, PLAIN_HTML);
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const initial = await request(app)
      .get("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" });
    expect(initial.status).toBe(200);

    const nextContent = PLAIN_HTML.replace("Body.", "Body updated.");
    const response = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" })
      .send({ content: nextContent, expectedVersion: initial.body.version });

    expect(response.status).toBe(200);
    expect(response.body.content).toContain("Body updated.");
    expect(response.body.version).not.toBe(initial.body.version);
    expect(response.body.document.source).toBe(response.body.content);
    expect(fs.readFileSync(absolutePath, "utf-8")).toContain("Body updated.");
  });

  it("rejects stale html writes with 409 and leaves disk unchanged", async () => {
    const absolutePath = path.join(projectDir, "doc.html");
    fs.writeFileSync(absolutePath, PLAIN_HTML);
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const initial = await request(app)
      .get("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" });
    expect(initial.status).toBe(200);

    // External change.
    const externalContent = PLAIN_HTML.replace("Body.", "External edit.");
    fs.writeFileSync(absolutePath, externalContent);
    const onDiskBefore = fs.readFileSync(absolutePath, "utf-8");

    const stale = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" })
      .send({
        content: PLAIN_HTML.replace("Body.", "Client edit."),
        expectedVersion: initial.body.version,
      });

    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("HTML file changed on disk");
    expect(stale.body.current).toBeDefined();
    expect(stale.body.current.content).toContain("External edit.");
    expect(fs.readFileSync(absolutePath, "utf-8")).toBe(onDiskBefore);
  });

  it("applies sanitizer on write and exposes warnings on returned read", async () => {
    const absolutePath = path.join(projectDir, "doc.html");
    fs.writeFileSync(absolutePath, PLAIN_HTML);
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const initial = await request(app)
      .get("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" });

    const malicious =
      `<!doctype html><html><head><title>Mal</title></head><body>` +
      `<p onclick="alert(1)">hi</p>` +
      `<script>alert('xss')</script>` +
      `<a href="javascript:alert(1)">bad</a>` +
      `</body></html>`;

    const response = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" })
      .send({ content: malicious, expectedVersion: initial.body.version });

    expect(response.status).toBe(200);
    expect(response.body.content).not.toContain("onclick");
    expect(response.body.content).not.toContain("<script");
    expect(response.body.content).not.toContain("javascript:");

    const codes = (
      response.body.sanitizerWarnings as Array<{ code: string }>
    ).map((warning) => warning.code);
    expect(codes).toContain("disallowed-attribute");
    expect(codes).toContain("disallowed-element");
    expect(codes).toContain("disallowed-url");

    const onDisk = fs.readFileSync(absolutePath, "utf-8");
    expect(onDisk).not.toContain("onclick");
    expect(onDisk).not.toContain("<script");
    expect(onDisk).not.toContain("javascript:");
    expect(onDisk).toBe(response.body.content);
  });

  it("writes a parsed document and re-reads with byte-stable output", async () => {
    const absolutePath = path.join(projectDir, "doc.html");
    fs.writeFileSync(absolutePath, PLAIN_HTML);
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const initial = await request(app)
      .get("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" });
    expect(initial.status).toBe(200);

    const firstWrite = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" })
      .send({
        document: initial.body.document,
        expectedVersion: initial.body.version,
      });
    expect(firstWrite.status).toBe(200);
    const bytesAfterFirst = fs.readFileSync(absolutePath);

    const reread = await request(app)
      .get("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" });
    expect(reread.status).toBe(200);

    const secondWrite = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" })
      .send({
        document: reread.body.document,
        expectedVersion: reread.body.version,
      });
    expect(secondWrite.status).toBe(200);
    const bytesAfterSecond = fs.readFileSync(absolutePath);

    expect(bytesAfterSecond.equals(bytesAfterFirst)).toBe(true);
  });

  it("rejects non-html extension with 400", async () => {
    fs.writeFileSync(path.join(projectDir, "notes.md"), "# Notes\n");
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "notes.md" })
      .send({ content: PLAIN_HTML });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "HTML file path must end with .html or .htm",
    });
  });

  it("returns 404 when the html file is missing", async () => {
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "missing.html" })
      .send({ content: PLAIN_HTML });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "HTML file not found" });
  });

  it("rejects missing content/document body with 400", async () => {
    const absolutePath = path.join(projectDir, "doc.html");
    fs.writeFileSync(absolutePath, PLAIN_HTML);
    const onDiskBefore = fs.readFileSync(absolutePath, "utf-8");
    const { app } = createApp({ homeDir, staticDirPath: projectDir });

    const response = await request(app)
      .put("/api/html-file")
      .query({ projectPath: projectDir, path: "doc.html" })
      .send({});

    expect(response.status).toBe(400);
    expect(fs.readFileSync(absolutePath, "utf-8")).toBe(onDiskBefore);
  });
});
