#!/usr/bin/env node
/**
 * Drive the stdio MCP server end-to-end against a fresh scratch HTML fixture
 * to produce real JSON-RPC evidence under .context/mcp-evidence/.
 *
 * Steps:
 *   1) initialize
 *   2) tools/list
 *   3) read_html_document
 *   4) add_comment
 *   5) accept_suggestion
 *   6) reject_suggestion on a second suggestion
 *   7) re-read
 *
 * Evidence emitted:
 *   .context/mcp-evidence/G6.1-read-html-document.json
 *   .context/mcp-evidence/G6.2-add-comment.json
 *   .context/mcp-evidence/G6.3-accept-suggestion.json
 *   .context/mcp-evidence/G6.3-reject-suggestion.json
 *   .context/mcp-evidence/G6.4-agent-flow.transcript.md
 *   .context/mcp-evidence/G6.4-fixture-before.html
 *   .context/mcp-evidence/G6.4-fixture-after.html
 *   .context/mcp-evidence/G6.4-fixture.diff
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, ".context", "mcp-evidence");
fs.mkdirSync(evidenceDir, { recursive: true });

const cliPath = path.join(
  repoRoot,
  "packages",
  "server",
  "bin",
  "roughdraft.mjs",
);

const scratchDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "roughdraft-mcp-evidence-"),
);
const docPath = path.join(scratchDir, "scratch.html");

const FIXTURE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Scratch evidence fixture</title>
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
      <p>
        Pipeline coverage improved to
        <ins data-rd-suggestion-id="s-pipe-1" data-rd-author="r@x" data-rd-created-at="2026-05-23T12:02:00Z">2.4x</ins>
        for the next quarter.
      </p>
    </article>
    <aside class="rd-review" hidden>
    </aside>
  </body>
</html>
`;

fs.writeFileSync(docPath, FIXTURE);
fs.writeFileSync(
  path.join(evidenceDir, "G6.4-fixture-before.html"),
  fs.readFileSync(docPath, "utf8"),
);

const child = spawn(process.execPath, [cliPath, "mcp"], {
  cwd: scratchDir,
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = Buffer.alloc(0);
const pending = new Map();
let nextId = 1;

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const lenMatch = header.match(/content-length:\s*(\d+)/i);
    if (!lenMatch) {
      console.error("Bad header:", header);
      process.exit(1);
    }
    const length = Number.parseInt(lenMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) break;
    const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
    buffer = buffer.subarray(bodyEnd);
    const message = JSON.parse(body);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  }
});

function send(method, params) {
  const id = nextId++;
  const message = { jsonrpc: "2.0", id, method, params };
  const body = Buffer.from(JSON.stringify(message), "utf8");
  child.stdin.write(`Content-Length: ${body.byteLength}\r\n\r\n`);
  child.stdin.write(body);
  return new Promise((resolve) => {
    pending.set(id, resolve);
  });
}

function unwrapResult(response) {
  const text = response.result?.content?.[0]?.text;
  if (typeof text !== "string") return response.result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const transcript = [];

function record(label, request, response, extra = {}) {
  transcript.push({
    label,
    timestamp: new Date().toISOString(),
    request,
    response,
    ...extra,
  });
}

try {
  const initRequest = {
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {} },
  };
  const initResponse = await send(initRequest.method, initRequest.params);
  record("initialize", initRequest, initResponse);

  const listRequest = { method: "tools/list", params: {} };
  const listResponse = await send(listRequest.method, listRequest.params);
  record("tools/list", listRequest, listResponse, {
    toolCount: listResponse.result?.tools?.length,
    htmlToolNames: (listResponse.result?.tools ?? [])
      .map((t) => t.name)
      .filter(
        (n) =>
          n.startsWith("roughdraft_") &&
          (n.includes("html") ||
            n.includes("comment") ||
            n.includes("suggestion")),
      ),
  });

  // Step 1: read_html_document
  const readArgs = { documentPath: docPath, projectRoot: scratchDir };
  const readRequest = {
    method: "tools/call",
    params: { name: "roughdraft_read_html_document", arguments: readArgs },
  };
  const readResponse = await send(readRequest.method, readRequest.params);
  const readResult = unwrapResult(readResponse);
  record("read_html_document (initial)", readRequest, readResponse, {
    parsed: {
      checksum: readResult?.checksum,
      commentCount: readResult?.document?.comments?.length,
      suggestionCount: readResult?.document?.suggestions?.length,
    },
  });
  fs.writeFileSync(
    path.join(evidenceDir, "G6.1-read-html-document.json"),
    JSON.stringify(
      { request: readRequest, response: readResponse, parsed: readResult },
      null,
      2,
    ),
  );

  // Step 2: add_comment
  const addArgs = {
    documentPath: docPath,
    projectRoot: scratchDir,
    id: "c-evidence-1",
    anchorText: "Revenue grew steadily",
    author: "agent@example.com",
    createdAt: "2026-05-23T19:00:00Z",
    body: "Add the exact percentage and source row.",
  };
  const addRequest = {
    method: "tools/call",
    params: { name: "roughdraft_add_comment", arguments: addArgs },
  };
  const addResponse = await send(addRequest.method, addRequest.params);
  const addResult = unwrapResult(addResponse);
  record("add_comment", addRequest, addResponse, { parsed: addResult });
  fs.writeFileSync(
    path.join(evidenceDir, "G6.2-add-comment.json"),
    JSON.stringify(
      { request: addRequest, response: addResponse, parsed: addResult },
      null,
      2,
    ),
  );

  // Step 3: accept_suggestion (substitution)
  const acceptArgs = {
    documentPath: docPath,
    projectRoot: scratchDir,
    id: "s-churn-1",
  };
  const acceptRequest = {
    method: "tools/call",
    params: { name: "roughdraft_accept_suggestion", arguments: acceptArgs },
  };
  const acceptResponse = await send(acceptRequest.method, acceptRequest.params);
  const acceptResult = unwrapResult(acceptResponse);
  record("accept_suggestion", acceptRequest, acceptResponse, {
    parsed: acceptResult,
  });
  fs.writeFileSync(
    path.join(evidenceDir, "G6.3-accept-suggestion.json"),
    JSON.stringify(
      {
        request: acceptRequest,
        response: acceptResponse,
        parsed: acceptResult,
      },
      null,
      2,
    ),
  );

  // Step 4: reject_suggestion (insertion)
  const rejectArgs = {
    documentPath: docPath,
    projectRoot: scratchDir,
    id: "s-pipe-1",
  };
  const rejectRequest = {
    method: "tools/call",
    params: { name: "roughdraft_reject_suggestion", arguments: rejectArgs },
  };
  const rejectResponse = await send(rejectRequest.method, rejectRequest.params);
  const rejectResult = unwrapResult(rejectResponse);
  record("reject_suggestion", rejectRequest, rejectResponse, {
    parsed: rejectResult,
  });
  fs.writeFileSync(
    path.join(evidenceDir, "G6.3-reject-suggestion.json"),
    JSON.stringify(
      {
        request: rejectRequest,
        response: rejectResponse,
        parsed: rejectResult,
      },
      null,
      2,
    ),
  );

  // Step 5: re-read
  const rereadRequest = {
    method: "tools/call",
    params: { name: "roughdraft_read_html_document", arguments: readArgs },
  };
  const rereadResponse = await send(rereadRequest.method, rereadRequest.params);
  const rereadResult = unwrapResult(rereadResponse);
  record("read_html_document (final)", rereadRequest, rereadResponse, {
    parsed: {
      checksum: rereadResult?.checksum,
      commentCount: rereadResult?.document?.comments?.length,
      suggestionCount: rereadResult?.document?.suggestions?.length,
    },
  });

  // Capture after disk content and diff
  fs.writeFileSync(
    path.join(evidenceDir, "G6.4-fixture-after.html"),
    fs.readFileSync(docPath, "utf8"),
  );

  let diff = "";
  try {
    const out = execFileSync(
      "diff",
      [
        "-u",
        path.join(evidenceDir, "G6.4-fixture-before.html"),
        path.join(evidenceDir, "G6.4-fixture-after.html"),
      ],
      { encoding: "utf8" },
    );
    diff = out;
  } catch (error) {
    diff = error.stdout?.toString() ?? String(error);
  }
  fs.writeFileSync(path.join(evidenceDir, "G6.4-fixture.diff"), diff);

  // Sanity check assertions
  const finalDisk = fs.readFileSync(docPath, "utf8");
  const assertions = [
    {
      name: "added comment id appears on disk",
      ok: finalDisk.includes('data-rd-comment-ids="c-evidence-1"'),
    },
    {
      name: "accepted substitution leaves ins text on disk",
      ok:
        finalDisk.includes("elevated but stable") &&
        !finalDisk.includes('data-rd-suggestion-id="s-churn-1"'),
    },
    {
      name: "rejected insertion removed from disk",
      ok:
        !finalDisk.includes('data-rd-suggestion-id="s-pipe-1"') &&
        !finalDisk.includes("2.4x"),
    },
    {
      name: "final re-read has 1 comment and 0 suggestions",
      ok:
        rereadResult?.document?.comments?.length === 1 &&
        rereadResult?.document?.suggestions?.length === 0,
    },
  ];

  const transcriptMd = [
    "# G6.4 — Real MCP Agent Flow Transcript",
    "",
    `Captured: ${new Date().toISOString()}`,
    "",
    `Scratch fixture: \`${docPath}\``,
    "",
    "Flow: initialize → tools/list → read → add_comment → accept_suggestion → reject_suggestion → re-read",
    "",
    "## Steps",
    "",
    ...transcript.map((entry) => {
      return [
        `### ${entry.label} — ${entry.timestamp}`,
        "",
        "Request:",
        "",
        "```json",
        JSON.stringify(entry.request, null, 2),
        "```",
        "",
        "Response (unwrapped tool result if applicable):",
        "",
        "```json",
        JSON.stringify(entry.response, null, 2),
        "```",
        "",
        entry.parsed
          ? [
              "Parsed:",
              "",
              "```json",
              JSON.stringify(entry.parsed, null, 2),
              "```",
              "",
            ].join("\n")
          : "",
      ].join("\n");
    }),
    "",
    "## Assertions",
    "",
    ...assertions.map((a) => `- ${a.ok ? "[x]" : "[ ]"} ${a.name}`),
    "",
    "## Disk diff (before → after)",
    "",
    "```diff",
    diff,
    "```",
    "",
  ].join("\n");

  fs.writeFileSync(
    path.join(evidenceDir, "G6.4-agent-flow.transcript.md"),
    transcriptMd,
  );

  child.stdin.end();
  child.kill("SIGTERM");

  const failures = assertions.filter((a) => !a.ok);
  if (failures.length > 0) {
    console.error("Assertion failures:", failures);
    process.exit(1);
  }
  console.log("MCP evidence captured under", evidenceDir);
} catch (error) {
  console.error("MCP evidence capture failed:", error);
  child.kill("SIGTERM");
  process.exit(1);
} finally {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}
