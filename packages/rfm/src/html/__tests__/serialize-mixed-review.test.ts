import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type AnnotatedHtmlDoc,
  type HtmlNode,
  parseAnnotatedHtml,
  serializeAnnotatedHtml,
} from "../../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../../.context/fixtures/html");

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

interface StableElement {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: StableNode[];
}

interface StableText {
  type: "text";
  value: string;
}

type StableNode = StableElement | StableText;

function toStableTree(nodes: HtmlNode[]): StableNode[] {
  return nodes.map((node) => {
    if (node.type === "element") {
      return {
        type: "element",
        tag: node.tag,
        attrs: { ...node.attrs },
        children: toStableTree(node.children),
      };
    }
    return { type: "text", value: node.value };
  });
}

interface StableComment {
  id: string;
  status: AnnotatedHtmlDoc["comments"][number]["status"];
  replyTo: string | null;
  body: string;
  anchorIds: string[];
}

function toStableComments(doc: AnnotatedHtmlDoc): StableComment[] {
  return doc.comments.map((comment) => ({
    id: comment.id,
    status: comment.status,
    replyTo: comment.replyTo,
    body: comment.body,
    anchorIds: [...comment.anchorIds],
  }));
}

interface StableSuggestion {
  id: string;
  kind: AnnotatedHtmlDoc["suggestions"][number]["kind"];
  status: AnnotatedHtmlDoc["suggestions"][number]["status"];
  author: string | null;
  createdAt: string | null;
  deletedText: string | undefined;
  insertedText: string | undefined;
}

function toStableSuggestions(doc: AnnotatedHtmlDoc): StableSuggestion[] {
  return doc.suggestions.map((suggestion) => ({
    id: suggestion.id,
    kind: suggestion.kind,
    status: suggestion.status,
    author: suggestion.author,
    createdAt: suggestion.createdAt,
    deletedText: suggestion.deletedText,
    insertedText: suggestion.insertedText,
  }));
}

interface StableWarning {
  code: string;
  message: string;
}

function toStableWarnings(doc: AnnotatedHtmlDoc): StableWarning[] {
  return doc.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
  }));
}

describe("serializeAnnotatedHtml — mixed-review acceptance", () => {
  it("round-trips mixed-review-document.html under low-churn equality", () => {
    const html = readFixture("mixed-review-document.html");

    const serialized = serializeAnnotatedHtml(parseAnnotatedHtml(html));

    expect(serialized).toBe(html);
  });

  it("model from parse(serialize(model)) equals the original model", () => {
    const html = readFixture("mixed-review-document.html");

    const doc = parseAnnotatedHtml(html);
    const serialized = serializeAnnotatedHtml(doc);
    const reparsed = parseAnnotatedHtml(serialized);

    expect(toStableComments(reparsed)).toEqual(toStableComments(doc));
    expect(toStableSuggestions(reparsed)).toEqual(toStableSuggestions(doc));
    expect(toStableWarnings(reparsed)).toEqual(toStableWarnings(doc));
    expect(toStableTree(reparsed.blocks)).toEqual(toStableTree(doc.blocks));
  });
});
