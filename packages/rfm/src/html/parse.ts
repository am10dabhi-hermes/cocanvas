import type {
  AnnotatedHtmlDoc,
  HtmlAnnotationComment,
  HtmlAnnotationSuggestion,
  HtmlAnnotationWarning,
  HtmlCommentStatus,
  HtmlElementNode,
  HtmlNode,
  HtmlSuggestionStatus,
} from "./types.js";

const VOID_ELEMENTS = new Set([
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

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

const PROTECTED_ZONE_TAGS = new Set(["script", "style", "pre", "code"]);

function isProtectedZone(node: HtmlElementNode): boolean {
  if (PROTECTED_ZONE_TAGS.has(node.tag)) return true;
  return Object.hasOwn(node.attrs, "data-rd-literal");
}

const ROOT_TAG = "#root";

type Token =
  | { kind: "doctype" }
  | { kind: "comment" }
  | { kind: "text"; value: string }
  | {
      kind: "open";
      tag: string;
      attrs: Record<string, string>;
      selfClosing: boolean;
    }
  | { kind: "close"; tag: string };

export function parseAnnotatedHtml(input: string): AnnotatedHtmlDoc {
  const doc: AnnotatedHtmlDoc = {
    format: "annotated-html",
    version: "0.1",
    source: input,
    blocks: [],
    comments: [],
    suggestions: [],
    warnings: [],
  };

  if (input.length === 0 || input.trim().length === 0) {
    return doc;
  }

  const roots = parseToNodes(input);
  doc.blocks = extractBlocks(roots);
  assignPositions(doc.blocks);

  const { comments, anchorIds, anchorIdOrder } = collectAnnotations(doc.blocks);
  doc.comments = comments;
  doc.suggestions = collectSuggestions(doc.blocks);
  doc.warnings = computeAnnotationWarnings(comments, anchorIds, anchorIdOrder);
  return doc;
}

function assignPositions(blocks: HtmlNode[]): void {
  let next = 0;
  const walk = (nodes: HtmlNode[]): void => {
    for (const node of nodes) {
      node.position = next;
      next += 1;
      if (node.type === "element") walk(node.children);
    }
  };
  walk(blocks);
}

function collectSuggestions(blocks: HtmlNode[]): HtmlAnnotationSuggestion[] {
  const suggestions: HtmlAnnotationSuggestion[] = [];

  const walk = (nodes: HtmlNode[]): void => {
    let index = 0;
    while (index < nodes.length) {
      const node = nodes[index];
      if (!node || node.type !== "element") {
        index += 1;
        continue;
      }

      if (isProtectedZone(node)) {
        index += 1;
        continue;
      }

      const isSuggestionElement =
        (node.tag === "ins" || node.tag === "del") &&
        Object.hasOwn(node.attrs, "data-rd-suggestion-id");

      if (!isSuggestionElement) {
        walk(node.children);
        index += 1;
        continue;
      }

      if (node.tag === "del") {
        const partnerIndex = findAdjacentInsIndex(nodes, index);
        if (partnerIndex !== -1) {
          const partner = nodes[partnerIndex] as HtmlElementNode;
          const delId = node.attrs["data-rd-suggestion-id"] ?? "";
          const insId = partner.attrs["data-rd-suggestion-id"] ?? "";
          if (delId.length > 0 && delId === insId) {
            suggestions.push({
              id: delId,
              kind: "substitution",
              author:
                node.attrs["data-rd-author"] ??
                partner.attrs["data-rd-author"] ??
                null,
              createdAt:
                node.attrs["data-rd-created-at"] ??
                partner.attrs["data-rd-created-at"] ??
                null,
              status: normalizeSuggestionStatus(
                node.attrs["data-rd-status"] ?? partner.attrs["data-rd-status"],
              ),
              deletedText: nodeTextContent(node),
              insertedText: nodeTextContent(partner),
              position: node.position,
            });
            walk(node.children);
            walk(partner.children);
            index = partnerIndex + 1;
            continue;
          }
        }
      }

      const id = node.attrs["data-rd-suggestion-id"] ?? "";
      if (id.length > 0) {
        const kind = node.tag === "ins" ? "insertion" : "deletion";
        const suggestion: HtmlAnnotationSuggestion = {
          id,
          kind,
          author: node.attrs["data-rd-author"] ?? null,
          createdAt: node.attrs["data-rd-created-at"] ?? null,
          status: normalizeSuggestionStatus(node.attrs["data-rd-status"]),
          position: node.position,
        };
        if (kind === "insertion") {
          suggestion.insertedText = nodeTextContent(node);
        } else {
          suggestion.deletedText = nodeTextContent(node);
        }
        suggestions.push(suggestion);
      }

      walk(node.children);
      index += 1;
    }
  };

  walk(blocks);
  return suggestions;
}

function findAdjacentInsIndex(nodes: HtmlNode[], delIndex: number): number {
  for (let cursor = delIndex + 1; cursor < nodes.length; cursor += 1) {
    const sibling = nodes[cursor];
    if (!sibling) return -1;
    if (sibling.type === "text") {
      if (sibling.value.trim().length === 0) continue;
      return -1;
    }
    if (sibling.type === "element" && sibling.tag === "ins") {
      return Object.hasOwn(sibling.attrs, "data-rd-suggestion-id")
        ? cursor
        : -1;
    }
    return -1;
  }
  return -1;
}

function normalizeSuggestionStatus(
  value: string | undefined,
): HtmlSuggestionStatus {
  if (value === "open" || value === "accepted" || value === "rejected") {
    return value;
  }
  return "open";
}

function collectAnnotations(blocks: HtmlNode[]): {
  comments: HtmlAnnotationComment[];
  anchorIds: Set<string>;
  anchorIdOrder: string[];
} {
  const comments: HtmlAnnotationComment[] = [];
  const anchorIds = new Set<string>();
  const anchorIdOrder: string[] = [];

  const walk = (nodes: HtmlNode[]): void => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      if (isProtectedZone(node)) continue;

      if (
        node.tag === "mark" &&
        Object.hasOwn(node.attrs, "data-rd-comment-ids")
      ) {
        const ids = splitIds(node.attrs["data-rd-comment-ids"] ?? "");
        for (const id of ids) {
          if (!anchorIds.has(id)) {
            anchorIds.add(id);
            anchorIdOrder.push(id);
          }
        }
      }

      if (node.tag === "rd-comment") {
        comments.push(toAnnotationComment(node));
        continue;
      }

      walk(node.children);
    }
  };

  walk(blocks);
  return { comments, anchorIds, anchorIdOrder };
}

function toAnnotationComment(node: HtmlElementNode): HtmlAnnotationComment {
  const id = node.attrs.id ?? "";
  const rawAnchorIds = node.attrs["data-rd-anchor-ids"];
  const anchorIds = rawAnchorIds === undefined ? [] : splitIds(rawAnchorIds);

  return {
    id,
    anchorIds,
    author: node.attrs["data-rd-author"] ?? null,
    createdAt: node.attrs["data-rd-created-at"] ?? null,
    updatedAt: node.attrs["data-rd-updated-at"] ?? null,
    status: normalizeStatus(node.attrs["data-rd-status"]),
    replyTo: node.attrs["data-rd-reply-to"] ?? null,
    body: nodeTextContent(node),
    position: node.position,
  };
}

function normalizeStatus(value: string | undefined): HtmlCommentStatus | null {
  if (value === "open" || value === "resolved") return value;
  return null;
}

function splitIds(value: string): string[] {
  return value.split(/\s+/).filter((id) => id.length > 0);
}

function nodeTextContent(node: HtmlNode): string {
  if (node.type === "text") return node.value;
  return node.children.map(nodeTextContent).join("");
}

function computeAnnotationWarnings(
  comments: HtmlAnnotationComment[],
  anchorIds: Set<string>,
  anchorIdOrder: string[],
): HtmlAnnotationWarning[] {
  const warnings: HtmlAnnotationWarning[] = [];
  const recordIds = new Set(comments.map((comment) => comment.id));

  for (const anchorId of anchorIdOrder) {
    if (!recordIds.has(anchorId)) {
      warnings.push({
        code: "orphan-anchor",
        message: `Anchor references comment id "${anchorId}" but no matching <rd-comment> record was found.`,
      });
    }
  }

  for (const comment of comments) {
    if (comment.replyTo) continue;
    if (anchorIds.has(comment.id)) continue;
    warnings.push({
      code: "orphan-record",
      message: `Comment record "${comment.id}" has no matching anchor.`,
    });
  }

  return warnings;
}

function extractBlocks(nodes: HtmlNode[]): HtmlNode[] {
  const body = findFirstElement(nodes, "body");
  const source = body ? body.children : nodes;
  return source.filter((node) => node.type === "element");
}

function findFirstElement(
  nodes: HtmlNode[],
  tag: string,
): HtmlElementNode | null {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (node.tag === tag) return node;
    const nested = findFirstElement(node.children, tag);
    if (nested) return nested;
  }
  return null;
}

function parseToNodes(input: string): HtmlNode[] {
  const tokens = tokenize(input);
  const root: HtmlElementNode = {
    type: "element",
    tag: ROOT_TAG,
    attrs: {},
    children: [],
    position: 0,
  };
  const stack: HtmlElementNode[] = [root];

  const current = (): HtmlElementNode => {
    const top = stack[stack.length - 1];
    if (!top) throw new Error("HTML parser stack underflow");
    return top;
  };

  for (const token of tokens) {
    if (token.kind === "doctype" || token.kind === "comment") {
      continue;
    }
    if (token.kind === "text") {
      current().children.push({
        type: "text",
        value: token.value,
        position: 0,
      });
      continue;
    }
    if (token.kind === "open") {
      const element: HtmlElementNode = {
        type: "element",
        tag: token.tag,
        attrs: token.attrs,
        children: [],
        position: 0,
      };
      current().children.push(element);
      if (!token.selfClosing && !VOID_ELEMENTS.has(token.tag)) {
        stack.push(element);
      }
      continue;
    }
    if (token.kind === "close") {
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i]?.tag === token.tag) {
          stack.length = i;
          break;
        }
      }
    }
  }

  return root.children;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    if (input[cursor] !== "<") {
      const nextTag = input.indexOf("<", cursor);
      const end = nextTag === -1 ? input.length : nextTag;
      tokens.push({ kind: "text", value: input.slice(cursor, end) });
      cursor = end;
      continue;
    }

    if (input.startsWith("<!--", cursor)) {
      const end = input.indexOf("-->", cursor + 4);
      if (end === -1) {
        tokens.push({ kind: "text", value: input.slice(cursor) });
        cursor = input.length;
        continue;
      }
      tokens.push({ kind: "comment" });
      cursor = end + 3;
      continue;
    }

    if (input.startsWith("<!", cursor)) {
      const end = input.indexOf(">", cursor + 2);
      if (end === -1) {
        tokens.push({ kind: "text", value: input.slice(cursor) });
        cursor = input.length;
        continue;
      }
      tokens.push({ kind: "doctype" });
      cursor = end + 1;
      continue;
    }

    if (input[cursor + 1] === "/") {
      const end = input.indexOf(">", cursor + 2);
      if (end === -1) {
        tokens.push({ kind: "text", value: input.slice(cursor) });
        cursor = input.length;
        continue;
      }
      const tag = input
        .slice(cursor + 2, end)
        .trim()
        .toLowerCase();
      tokens.push({ kind: "close", tag });
      cursor = end + 1;
      continue;
    }

    const tagResult = readOpenTag(input, cursor);
    if (!tagResult) {
      tokens.push({ kind: "text", value: "<" });
      cursor += 1;
      continue;
    }

    tokens.push(tagResult.token);
    cursor = tagResult.next;

    if (
      tagResult.token.kind === "open" &&
      RAW_TEXT_ELEMENTS.has(tagResult.token.tag) &&
      !tagResult.token.selfClosing
    ) {
      const tag = tagResult.token.tag;
      const closingPattern = new RegExp(`</${tag}\\b[^>]*>`, "i");
      const closingMatch = closingPattern.exec(input.slice(cursor));
      if (closingMatch) {
        const raw = input.slice(cursor, cursor + closingMatch.index);
        if (raw.length > 0) {
          tokens.push({ kind: "text", value: raw });
        }
        tokens.push({ kind: "close", tag });
        cursor = cursor + closingMatch.index + closingMatch[0].length;
      } else {
        const raw = input.slice(cursor);
        if (raw.length > 0) {
          tokens.push({ kind: "text", value: raw });
        }
        cursor = input.length;
      }
    }
  }

  return tokens;
}

function readOpenTag(
  input: string,
  start: number,
): { token: Token; next: number } | null {
  let cursor = start + 1;
  const nameStart = cursor;
  while (
    cursor < input.length &&
    isTagNameChar(input.charCodeAt(cursor), cursor === nameStart)
  ) {
    cursor += 1;
  }
  if (cursor === nameStart) return null;
  const tag = input.slice(nameStart, cursor).toLowerCase();
  const attrs: Record<string, string> = {};

  while (cursor < input.length) {
    while (cursor < input.length && isWhitespace(input.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (input[cursor] === "/" && input[cursor + 1] === ">") {
      return {
        token: { kind: "open", tag, attrs, selfClosing: true },
        next: cursor + 2,
      };
    }
    if (input[cursor] === ">") {
      return {
        token: { kind: "open", tag, attrs, selfClosing: false },
        next: cursor + 1,
      };
    }
    const attrNameStart = cursor;
    while (cursor < input.length && isAttrNameChar(input.charCodeAt(cursor))) {
      cursor += 1;
    }
    if (cursor === attrNameStart) {
      return null;
    }
    const attrName = input.slice(attrNameStart, cursor).toLowerCase();
    let value = "";
    if (input[cursor] === "=") {
      cursor += 1;
      const quote = input[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueEnd = input.indexOf(quote, cursor);
        if (valueEnd === -1) return null;
        value = input.slice(cursor, valueEnd);
        cursor = valueEnd + 1;
      } else {
        const valueStart = cursor;
        while (
          cursor < input.length &&
          !isWhitespace(input.charCodeAt(cursor)) &&
          input[cursor] !== ">" &&
          input[cursor] !== "/"
        ) {
          cursor += 1;
        }
        value = input.slice(valueStart, cursor);
      }
    }
    attrs[attrName] = value;
  }

  return null;
}

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isTagNameChar(code: number, first: boolean): boolean {
  if (first) {
    return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
  }
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2d
  );
}

function isAttrNameChar(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2d ||
    code === 0x5f ||
    code === 0x3a
  );
}
