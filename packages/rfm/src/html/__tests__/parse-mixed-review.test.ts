import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type HtmlElementNode,
  type HtmlNode,
  parseAnnotatedHtml,
} from "../../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../../.context/fixtures/html");

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

function findElements(
  nodes: HtmlNode[],
  predicate: (element: HtmlElementNode) => boolean,
): HtmlElementNode[] {
  const found: HtmlElementNode[] = [];
  const walk = (list: HtmlNode[]) => {
    for (const node of list) {
      if (node.type !== "element") continue;
      if (predicate(node)) found.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

function firstElement(
  nodes: HtmlNode[],
  predicate: (element: HtmlElementNode) => boolean,
): HtmlElementNode | undefined {
  return findElements(nodes, predicate)[0];
}

describe("parseAnnotatedHtml — mixed-review acceptance", () => {
  it("parses every comment, suggestion, and anchor in mixed-review-document.html into a stable shape", () => {
    const html = readFixture("mixed-review-document.html");
    const doc = parseAnnotatedHtml(html);

    expect(doc.format).toBe("annotated-html");
    expect(doc.version).toBe("0.1");
    expect(doc.source).toBe(html);

    const topLevelTags = doc.blocks
      .filter((node): node is HtmlElementNode => node.type === "element")
      .map((element) => element.tag);
    expect(topLevelTags).toEqual(["article", "aside"]);

    expect(doc.warnings).toEqual([]);

    expect(doc.comments.map((comment) => comment.id)).toEqual([
      "c-rev-1",
      "c-team-1",
      "c-team-2",
      "c-risk-1",
    ]);

    const byId = new Map(doc.comments.map((comment) => [comment.id, comment]));

    const rev = byId.get("c-rev-1");
    expect(rev).toBeDefined();
    if (!rev) return;
    expect(rev.author).toBe("reviewer@example.com");
    expect(rev.status).toBe("open");
    expect(rev.replyTo).toBeNull();
    expect(rev.anchorIds).toEqual(["c-rev-1"]);
    expect(rev.body).toBe("Cite the exact source row.");

    const team1 = byId.get("c-team-1");
    expect(team1).toBeDefined();
    if (!team1) return;
    expect(team1.author).toBe("ananth@cradlewise.com");
    expect(team1.status).toBe("open");
    expect(team1.replyTo).toBeNull();
    expect(team1.anchorIds).toEqual(["c-team-1"]);
    expect(team1.body).toBe("Mention headcount delta.");

    const team2 = byId.get("c-team-2");
    expect(team2).toBeDefined();
    if (!team2) return;
    expect(team2.author).toBe("reviewer@example.com");
    expect(team2.status).toBe("open");
    expect(team2.replyTo).toBe("c-team-1");
    expect(team2.anchorIds).toEqual(["c-team-1"]);
    expect(team2.body).toBe("+1, and split by office.");

    const risk = byId.get("c-risk-1");
    expect(risk).toBeDefined();
    if (!risk) return;
    expect(risk.author).toBe("ananth@cradlewise.com");
    expect(risk.status).toBe("resolved");
    expect(risk.replyTo).toBeNull();
    expect(risk.anchorIds).toEqual(["c-risk-1"]);
    expect(risk.body).toBe("Fixed in last release.");

    expect(doc.suggestions.map((suggestion) => suggestion.id)).toEqual([
      "s-rev-1",
      "s-churn-1",
    ]);

    const sRev = doc.suggestions.find((s) => s.id === "s-rev-1");
    expect(sRev).toBeDefined();
    if (!sRev) return;
    expect(sRev.kind).toBe("insertion");
    expect(sRev.author).toBe("ananth@cradlewise.com");
    expect(sRev.createdAt).toBe("2026-05-23T12:00:00Z");
    expect(sRev.insertedText).toBe("12%");
    expect(sRev.deletedText).toBeUndefined();

    const sChurn = doc.suggestions.find((s) => s.id === "s-churn-1");
    expect(sChurn).toBeDefined();
    if (!sChurn) return;
    expect(sChurn.kind).toBe("substitution");
    expect(sChurn.author).toBe("reviewer@example.com");
    expect(sChurn.createdAt).toBe("2026-05-23T12:01:00Z");
    expect(sChurn.deletedText).toBe("high");
    expect(sChurn.insertedText).toBe("elevated but stable");

    const multiAnchors = findElements(
      doc.blocks,
      (element) =>
        element.tag === "mark" &&
        (element.attrs["data-rd-comment-ids"] ?? "")
          .split(/\s+/)
          .filter(Boolean).length > 1,
    );
    expect(multiAnchors).toHaveLength(1);
    const multi = multiAnchors[0];
    if (!multi) return;
    expect(multi.attrs["data-rd-comment-ids"]).toBe("c-team-1 c-team-2");
  });

  it("assigns each model node a deterministic position-in-document so later chunks can sort by it", () => {
    const html = readFixture("mixed-review-document.html");
    const first = parseAnnotatedHtml(html);
    const second = parseAnnotatedHtml(html);

    const collectPositions = (nodes: HtmlNode[]): number[] => {
      const positions: number[] = [];
      const walk = (list: HtmlNode[]) => {
        for (const node of list) {
          positions.push(node.position);
          if (node.type === "element") walk(node.children);
        }
      };
      walk(nodes);
      return positions;
    };

    const firstPositions = collectPositions(first.blocks);
    const secondPositions = collectPositions(second.blocks);

    expect(firstPositions.length).toBeGreaterThan(0);
    expect(firstPositions).toEqual(secondPositions);

    const uniquePositions = new Set(firstPositions);
    expect(uniquePositions.size).toBe(firstPositions.length);

    const article = firstElement(
      first.blocks,
      (element) => element.tag === "article",
    );
    const aside = firstElement(
      first.blocks,
      (element) => element.tag === "aside",
    );
    expect(article).toBeDefined();
    expect(aside).toBeDefined();
    if (!article || !aside) return;
    expect(article.position).toBeLessThan(aside.position);

    const suggestionPositionById = new Map(
      first.suggestions.map((suggestion) => [
        suggestion.id,
        suggestion.position,
      ]),
    );
    const sRevPos = suggestionPositionById.get("s-rev-1");
    const sChurnPos = suggestionPositionById.get("s-churn-1");
    expect(typeof sRevPos).toBe("number");
    expect(typeof sChurnPos).toBe("number");
    if (sRevPos === undefined || sChurnPos === undefined) return;
    expect(sRevPos).toBeLessThan(sChurnPos);

    const delElements = findElements(
      first.blocks,
      (element) =>
        element.tag === "del" &&
        element.attrs["data-rd-suggestion-id"] === "s-churn-1",
    );
    const insElements = findElements(
      first.blocks,
      (element) =>
        element.tag === "ins" &&
        element.attrs["data-rd-suggestion-id"] === "s-churn-1",
    );
    expect(delElements).toHaveLength(1);
    expect(insElements).toHaveLength(1);
    const delEl = delElements[0];
    const insEl = insElements[0];
    if (!delEl || !insEl) return;
    expect(delEl.position).toBeLessThan(insEl.position);
    expect(sChurnPos).toBe(delEl.position);

    const sRevInsElements = findElements(
      first.blocks,
      (element) =>
        element.tag === "ins" &&
        element.attrs["data-rd-suggestion-id"] === "s-rev-1",
    );
    expect(sRevInsElements).toHaveLength(1);
    const sRevIns = sRevInsElements[0];
    if (!sRevIns) return;
    expect(sRevPos).toBe(sRevIns.position);

    const commentPositionById = new Map(
      first.comments.map((comment) => [comment.id, comment.position]),
    );
    const cRev = commentPositionById.get("c-rev-1");
    const cTeam1 = commentPositionById.get("c-team-1");
    const cTeam2 = commentPositionById.get("c-team-2");
    const cRisk = commentPositionById.get("c-risk-1");
    expect(typeof cRev).toBe("number");
    expect(typeof cTeam1).toBe("number");
    expect(typeof cTeam2).toBe("number");
    expect(typeof cRisk).toBe("number");
    if (
      cRev === undefined ||
      cTeam1 === undefined ||
      cTeam2 === undefined ||
      cRisk === undefined
    ) {
      return;
    }
    expect(cRev).toBeLessThan(cTeam1);
    expect(cTeam1).toBeLessThan(cTeam2);
    expect(cTeam2).toBeLessThan(cRisk);

    const rdCommentElements = findElements(
      first.blocks,
      (element) => element.tag === "rd-comment",
    );
    const elementPositionById = new Map(
      rdCommentElements.map((element) => [
        element.attrs.id ?? "",
        element.position,
      ]),
    );
    for (const [id, position] of commentPositionById) {
      expect(elementPositionById.get(id)).toBe(position);
    }
  });
});
