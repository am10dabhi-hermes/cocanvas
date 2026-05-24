import { parseAnnotatedHtml } from "./parse.js";
import type {
  AnnotatedHtmlDoc,
  HtmlCommentStatus,
  HtmlSuggestionStatus,
} from "./types.js";

export interface AddHtmlCommentAnchor {
  text: string;
  occurrence?: number;
}

export interface AddHtmlCommentInput {
  id: string;
  anchor: AddHtmlCommentAnchor;
  author: string;
  createdAt: string;
  body: string;
  status?: HtmlCommentStatus;
  replyTo?: string;
  anchorIds?: string[];
}

export interface EditHtmlCommentInput {
  id: string;
  body?: string;
  status?: HtmlCommentStatus;
  updatedAt?: string;
}

export interface RemoveHtmlCommentInput {
  id: string;
}

export interface SuggestionMutationInput {
  id: string;
}

export function addHtmlComment(
  doc: AnnotatedHtmlDoc,
  input: AddHtmlCommentInput,
): AnnotatedHtmlDoc {
  if (!isValidId(input.id)) {
    throw new Error(`addHtmlComment: invalid id "${input.id}"`);
  }
  let source = doc.source;
  source = wrapTextWithMark(
    source,
    input.anchor.text,
    input.id,
    input.anchor.occurrence ?? 1,
  );
  const record = buildCommentRecord({
    id: input.id,
    author: input.author,
    createdAt: input.createdAt,
    status: input.status ?? "open",
    body: input.body,
    anchorIds: input.anchorIds ?? [input.id],
    replyTo: input.replyTo,
  });
  source = insertCommentRecordIntoAside(source, record);
  return parseAnnotatedHtml(source);
}

export function editHtmlComment(
  doc: AnnotatedHtmlDoc,
  input: EditHtmlCommentInput,
): AnnotatedHtmlDoc {
  let source = doc.source;
  const range = findCommentRecord(source, input.id);
  if (!range) {
    throw new Error(`editHtmlComment: comment id "${input.id}" not found`);
  }

  if (input.body !== undefined) {
    source =
      source.slice(0, range.bodyStart) +
      escapeText(input.body) +
      source.slice(range.bodyEnd);
  }

  if (input.status !== undefined || input.updatedAt !== undefined) {
    const range2 = findCommentRecord(source, input.id);
    if (!range2) {
      throw new Error(`editHtmlComment: lost comment "${input.id}"`);
    }
    let openTag = source.slice(range2.openStart, range2.openEnd);
    if (input.status !== undefined) {
      openTag = setAttr(openTag, "data-rd-status", input.status);
    }
    if (input.updatedAt !== undefined) {
      openTag = setAttr(openTag, "data-rd-updated-at", input.updatedAt);
    }
    source =
      source.slice(0, range2.openStart) +
      openTag +
      source.slice(range2.openEnd);
  }

  return parseAnnotatedHtml(source);
}

export function removeHtmlComment(
  doc: AnnotatedHtmlDoc,
  input: RemoveHtmlCommentInput,
): AnnotatedHtmlDoc {
  let source = doc.source;
  source = removeIdFromAnchors(source, input.id);
  source = removeCommentRecord(source, input.id);
  return parseAnnotatedHtml(source);
}

export function acceptHtmlSuggestion(
  doc: AnnotatedHtmlDoc,
  input: SuggestionMutationInput,
): AnnotatedHtmlDoc {
  const found = findSuggestion(doc.source, input.id);
  if (!found) {
    throw new Error(`acceptHtmlSuggestion: suggestion "${input.id}" not found`);
  }
  let replacement: string;
  if (found.kind === "substitution") {
    replacement = found.insText ?? "";
  } else if (found.kind === "insertion") {
    replacement = found.insText ?? "";
  } else {
    replacement = "";
  }
  const next =
    doc.source.slice(0, found.start) +
    replacement +
    doc.source.slice(found.end);
  return parseAnnotatedHtml(next);
}

export function rejectHtmlSuggestion(
  doc: AnnotatedHtmlDoc,
  input: SuggestionMutationInput,
): AnnotatedHtmlDoc {
  const found = findSuggestion(doc.source, input.id);
  if (!found) {
    throw new Error(`rejectHtmlSuggestion: suggestion "${input.id}" not found`);
  }
  let replacement: string;
  if (found.kind === "substitution") {
    replacement = found.delText ?? "";
  } else if (found.kind === "deletion") {
    replacement = found.delText ?? "";
  } else {
    replacement = "";
  }
  const next =
    doc.source.slice(0, found.start) +
    replacement +
    doc.source.slice(found.end);
  return parseAnnotatedHtml(next);
}

function buildCommentRecord(input: {
  id: string;
  author: string;
  createdAt: string;
  status: HtmlCommentStatus;
  body: string;
  anchorIds: string[];
  replyTo: string | undefined;
}): string {
  const replyAttr = input.replyTo
    ? ` data-rd-reply-to="${escapeAttr(input.replyTo)}"`
    : "";
  return [
    "<rd-comment",
    ` id="${escapeAttr(input.id)}"`,
    ` data-rd-author="${escapeAttr(input.author)}"`,
    ` data-rd-created-at="${escapeAttr(input.createdAt)}"`,
    ` data-rd-anchor-ids="${escapeAttr(input.anchorIds.join(" "))}"`,
    ` data-rd-status="${escapeAttr(input.status)}"`,
    replyAttr,
    `>${escapeText(input.body)}</rd-comment>`,
  ].join("");
}

function wrapTextWithMark(
  source: string,
  target: string,
  id: string,
  occurrence: number,
): string {
  if (target.length === 0) {
    throw new Error("addHtmlComment: anchor text must not be empty");
  }
  const positions = findPlainTextOccurrences(source, target);
  if (positions.length < occurrence) {
    throw new Error(
      `addHtmlComment: anchor text "${target}" not found at occurrence ${occurrence}`,
    );
  }
  const pos = positions[occurrence - 1] ?? -1;

  const merged = tryMergeIntoExistingMark(source, pos, target, id);
  if (merged !== null) return merged;

  return (
    source.slice(0, pos) +
    `<mark data-rd-comment-ids="${escapeAttr(id)}">${target}</mark>` +
    source.slice(pos + target.length)
  );
}

function tryMergeIntoExistingMark(
  source: string,
  pos: number,
  target: string,
  id: string,
): string | null {
  if (pos <= 0) return null;
  if (source[pos - 1] !== ">") return null;
  let start = pos - 1;
  while (start > 0 && source[start] !== "<") {
    start -= 1;
  }
  if (source[start] !== "<") return null;
  const openTag = source.slice(start, pos);
  if (!/^<mark\b/i.test(openTag)) return null;
  if (
    source.slice(pos + target.length, pos + target.length + 7) !== "</mark>"
  ) {
    return null;
  }
  const idsMatch = /\bdata-rd-comment-ids\s*=\s*"([^"]*)"/.exec(openTag);
  if (!idsMatch) return null;
  const existing = (idsMatch[1] ?? "").split(/\s+/).filter(Boolean);
  if (existing.includes(id)) return source;
  const newIds = [...existing, id].join(" ");
  const newOpenTag = openTag.replace(
    /\bdata-rd-comment-ids\s*=\s*"[^"]*"/,
    `data-rd-comment-ids="${escapeAttr(newIds)}"`,
  );
  return source.slice(0, start) + newOpenTag + source.slice(pos);
}

function findPlainTextOccurrences(source: string, target: string): number[] {
  const positions: number[] = [];
  const ranges = computeProtectedRanges(source);
  let cursor = 0;
  while (cursor <= source.length - target.length) {
    const index = source.indexOf(target, cursor);
    if (index === -1) break;
    if (
      isPlainTextOffset(source, index) &&
      !isInProtectedRange(index, ranges)
    ) {
      positions.push(index);
    }
    cursor = index + 1;
  }
  return positions;
}

const PROTECTED_TAGS = new Set(["script", "style", "pre", "code"]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Returns true when `offset` is not inside an open tag (e.g. inside attribute
// markup). It does NOT check protected-zone subtrees; callers must also use
// `computeProtectedRanges`/`isInProtectedRange` for that purpose.
function isPlainTextOffset(source: string, offset: number): boolean {
  let cursor = 0;
  let inTag = false;
  let quote: string | null = null;

  while (cursor < offset) {
    const ch = source[cursor];
    if (inTag) {
      if (quote) {
        if (ch === quote) quote = null;
        cursor += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        cursor += 1;
        continue;
      }
      if (ch === ">") {
        inTag = false;
        cursor += 1;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (ch === "<") {
      inTag = true;
      cursor += 1;
      continue;
    }

    cursor += 1;
  }

  return !inTag;
}

interface ParsedTag {
  tag: string;
  isClose: boolean;
  selfClosing: boolean;
  hasRdLiteral: boolean;
  tagEnd: number;
}

function peekTag(source: string, start: number): ParsedTag | null {
  if (source[start] !== "<") return null;
  let i = start + 1;
  let isClose = false;
  if (source[i] === "/") {
    isClose = true;
    i += 1;
  }
  const nameStart = i;
  while (i < source.length && /[A-Za-z0-9-]/.test(source[i] ?? "")) {
    i += 1;
  }
  if (i === nameStart) return null;
  const tag = source.slice(nameStart, i).toLowerCase();

  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === ">") break;
    i += 1;
  }
  if (i >= source.length) return null;

  const tagEnd = i;
  const selfClosing = source[tagEnd - 1] === "/";
  const attrSection = source.slice(nameStart + tag.length, tagEnd);
  const hasRdLiteral = !isClose && attrHasName(attrSection, "data-rd-literal");
  return { tag, isClose, selfClosing, hasRdLiteral, tagEnd };
}

function attrHasName(section: string, name: string): boolean {
  let i = 0;
  while (i < section.length) {
    while (i < section.length && /\s/.test(section[i] ?? "")) i += 1;
    if (i >= section.length) break;
    const ch = section[i];
    if (ch === "/" || ch === ">") {
      i += 1;
      continue;
    }
    const nameStart = i;
    while (i < section.length && !/[\s=/>]/.test(section[i] ?? "")) i += 1;
    const attrName = section.slice(nameStart, i).toLowerCase();
    while (i < section.length && /\s/.test(section[i] ?? "")) i += 1;
    if (section[i] === "=") {
      i += 1;
      while (i < section.length && /\s/.test(section[i] ?? "")) i += 1;
      const q = section[i];
      if (q === '"' || q === "'") {
        i += 1;
        while (i < section.length && section[i] !== q) i += 1;
        if (i < section.length) i += 1;
      } else {
        while (i < section.length && !/[\s>]/.test(section[i] ?? "")) i += 1;
      }
    }
    if (attrName === name) return true;
  }
  return false;
}

type ProtectedRange = readonly [number, number];

function computeProtectedRanges(source: string): ProtectedRange[] {
  const ranges: Array<[number, number]> = [];
  const stack: Array<{ tag: string; start: number; protected: boolean }> = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] !== "<") {
      cursor += 1;
      continue;
    }
    const tagInfo = peekTag(source, cursor);
    if (!tagInfo) {
      cursor += 1;
      continue;
    }
    const tagEnd = tagInfo.tagEnd;
    if (tagInfo.isClose) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const entry = stack[i];
        if (entry && entry.tag === tagInfo.tag) {
          if (entry.protected) {
            ranges.push([entry.start, tagEnd + 1]);
          }
          stack.splice(i, 1);
          break;
        }
      }
    } else if (!tagInfo.selfClosing && !VOID_TAGS.has(tagInfo.tag)) {
      const isProtected =
        PROTECTED_TAGS.has(tagInfo.tag) || tagInfo.hasRdLiteral;
      stack.push({ tag: tagInfo.tag, start: cursor, protected: isProtected });
    }
    cursor = tagEnd + 1;
  }
  // Any unclosed protected tags: protect from their start to end-of-source.
  for (const entry of stack) {
    if (entry.protected) {
      ranges.push([entry.start, source.length]);
    }
  }
  return ranges;
}

function isInProtectedRange(
  offset: number,
  ranges: readonly ProtectedRange[],
): boolean {
  for (const [start, end] of ranges) {
    if (offset >= start && offset < end) return true;
  }
  return false;
}

function insertCommentRecordIntoAside(source: string, record: string): string {
  const asideOpen = /<aside\b([^>]*)>/gi;
  while (true) {
    const match = asideOpen.exec(source);
    if (match === null) break;
    const attrs = match[1] ?? "";
    if (!/\bclass\s*=\s*"[^"]*\brd-review\b[^"]*"/.test(attrs)) continue;
    const openEnd = match.index + match[0].length;
    const closeIdx = source.indexOf("</aside>", openEnd);
    if (closeIdx === -1) break;

    let lineStart = closeIdx;
    while (lineStart > openEnd && source[lineStart - 1] !== "\n") {
      lineStart -= 1;
    }
    const closeIndent = source.slice(lineStart, closeIdx);
    const recordIndent = `${closeIndent}  `;
    const inserted = `${recordIndent}${record}\n`;
    return source.slice(0, lineStart) + inserted + source.slice(lineStart);
  }

  return createAsideWithRecord(source, record);
}

function createAsideWithRecord(source: string, record: string): string {
  const bodyClose = source.lastIndexOf("</body>");
  if (bodyClose === -1) {
    return `${source}\n<aside class="rd-review" hidden>\n  ${record}\n</aside>\n`;
  }
  let lineStart = bodyClose;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }
  const indent = source.slice(lineStart, bodyClose);
  const asideBlock =
    `${indent}<aside class="rd-review" hidden>\n` +
    `${indent}  ${record}\n` +
    `${indent}</aside>\n`;
  return source.slice(0, lineStart) + asideBlock + source.slice(lineStart);
}

interface CommentRange {
  openStart: number;
  openEnd: number;
  bodyStart: number;
  bodyEnd: number;
  closeStart: number;
  closeEnd: number;
}

function findCommentRecord(source: string, id: string): CommentRange | null {
  const ranges = computeProtectedRanges(source);
  const re = /<rd-comment\b([^>]*)>/gi;
  while (true) {
    const match = re.exec(source);
    if (match === null) break;
    if (isInProtectedRange(match.index, ranges)) continue;
    const attrs = match[1] ?? "";
    const idMatch = /\bid\s*=\s*"([^"]*)"/.exec(attrs);
    if (!idMatch || idMatch[1] !== id) continue;
    const openStart = match.index;
    const openEnd = match.index + match[0].length;
    const closeStart = source.indexOf("</rd-comment>", openEnd);
    if (closeStart === -1) return null;
    return {
      openStart,
      openEnd,
      bodyStart: openEnd,
      bodyEnd: closeStart,
      closeStart,
      closeEnd: closeStart + "</rd-comment>".length,
    };
  }
  return null;
}

function removeCommentRecord(source: string, id: string): string {
  const range = findCommentRecord(source, id);
  if (!range) return source;
  let start = range.openStart;
  while (
    start > 0 &&
    (source[start - 1] === " " || source[start - 1] === "\t")
  ) {
    start -= 1;
  }
  if (start > 0 && source[start - 1] === "\n") start -= 1;
  return source.slice(0, start) + source.slice(range.closeEnd);
}

function removeIdFromAnchors(source: string, id: string): string {
  const ranges = computeProtectedRanges(source);
  const markRe = /<mark\b([^>]*)>([\s\S]*?)<\/mark>/gi;
  const replacements: Array<{
    start: number;
    end: number;
    replacement: string;
  }> = [];
  while (true) {
    const match = markRe.exec(source);
    if (match === null) break;
    if (isInProtectedRange(match.index, ranges)) continue;
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const idsMatch = /\bdata-rd-comment-ids\s*=\s*"([^"]*)"/.exec(attrs);
    if (!idsMatch) continue;
    const ids = (idsMatch[1] ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(id)) continue;
    const remaining = ids.filter((value) => value !== id);
    const replacement =
      remaining.length === 0
        ? inner
        : `<mark${attrs.replace(
            /\bdata-rd-comment-ids\s*=\s*"[^"]*"/,
            `data-rd-comment-ids="${escapeAttr(remaining.join(" "))}"`,
          )}>${inner}</mark>`;
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement,
    });
  }
  if (replacements.length === 0) return source;
  let result = "";
  let cursor = 0;
  for (const r of replacements) {
    result += source.slice(cursor, r.start) + r.replacement;
    cursor = r.end;
  }
  result += source.slice(cursor);
  return result;
}

interface SuggestionMatch {
  kind: "substitution" | "insertion" | "deletion";
  start: number;
  end: number;
  delText?: string;
  insText?: string;
}

function findSuggestion(source: string, id: string): SuggestionMatch | null {
  const ranges = computeProtectedRanges(source);
  const escaped = escapeReg(id);
  const substRe = new RegExp(
    `<del\\b([^>]*?\\bdata-rd-suggestion-id\\s*=\\s*"${escaped}"[^>]*)>([\\s\\S]*?)</del>(\\s*)<ins\\b([^>]*?\\bdata-rd-suggestion-id\\s*=\\s*"${escaped}"[^>]*)>([\\s\\S]*?)</ins>`,
    "gi",
  );
  const sm = findFirstNonProtected(source, substRe, ranges);
  if (sm) {
    const end = sm.index + sm[0].length;
    if (!isInProtectedRange(end - 1, ranges)) {
      return {
        kind: "substitution",
        start: sm.index,
        end,
        delText: sm[2] ?? "",
        insText: sm[5] ?? "",
      };
    }
  }

  const insRe = new RegExp(
    `<ins\\b([^>]*?\\bdata-rd-suggestion-id\\s*=\\s*"${escaped}"[^>]*)>([\\s\\S]*?)</ins>`,
    "gi",
  );
  const im = findFirstNonProtected(source, insRe, ranges);
  if (im) {
    return {
      kind: "insertion",
      start: im.index,
      end: im.index + im[0].length,
      insText: im[2] ?? "",
    };
  }

  const delRe = new RegExp(
    `<del\\b([^>]*?\\bdata-rd-suggestion-id\\s*=\\s*"${escaped}"[^>]*)>([\\s\\S]*?)</del>`,
    "gi",
  );
  const dm = findFirstNonProtected(source, delRe, ranges);
  if (dm) {
    return {
      kind: "deletion",
      start: dm.index,
      end: dm.index + dm[0].length,
      delText: dm[2] ?? "",
    };
  }

  return null;
}

function findFirstNonProtected(
  source: string,
  re: RegExp,
  ranges: readonly ProtectedRange[],
): RegExpExecArray | null {
  re.lastIndex = 0;
  while (true) {
    const m = re.exec(source);
    if (!m) return null;
    if (!isInProtectedRange(m.index, ranges)) {
      return m;
    }
    re.lastIndex = m.index + 1;
  }
}

function setAttr(openTag: string, name: string, value: string): string {
  const re = new RegExp(`\\b${escapeReg(name)}\\s*=\\s*"[^"]*"`);
  const replacement = `${name}="${escapeAttr(value)}"`;
  if (re.test(openTag)) {
    return openTag.replace(re, replacement);
  }
  const insertAt = openTag.lastIndexOf(">");
  if (insertAt === -1) return openTag;
  const before = openTag.slice(0, insertAt);
  const after = openTag.slice(insertAt);
  const padded = before.endsWith(" ") ? before : `${before} `;
  return `${padded}${replacement}${after}`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export type { HtmlCommentStatus, HtmlSuggestionStatus };
