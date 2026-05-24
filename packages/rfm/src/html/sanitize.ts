export interface HtmlSanitizerWarning {
  code: string;
  message: string;
}

export interface SanitizeAnnotatedHtmlResult {
  html: string;
  warnings: HtmlSanitizerWarning[];
}

const DISALLOWED_ELEMENTS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "textarea",
]);

const ALLOWED_ELEMENTS = new Set([
  "html",
  "head",
  "body",
  "meta",
  "title",
  "link",
  "style",
  "article",
  "section",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "figure",
  "figcaption",
  "hr",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "pre",
  "a",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "code",
  "kbd",
  "samp",
  "var",
  "sub",
  "sup",
  "br",
  "img",
  "mark",
  "ins",
  "del",
  "rd-comment",
]);

const GLOBAL_ALLOWED_ATTRS = new Set([
  "id",
  "class",
  "lang",
  "title",
  "dir",
  "hidden",
]);

const ELEMENT_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt"]),
  link: new Set(["rel", "href"]),
  meta: new Set(["charset", "name", "content"]),
};

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

const PROTECTED_ELEMENTS = new Set(["pre", "code", "script", "style"]);

interface ParsedAttr {
  name: string;
  hasValue: boolean;
  value: string;
  quote: '"' | "'" | "";
}

interface OpenTag {
  kind: "open";
  tagName: string;
  attrs: ParsedAttr[];
  selfClosing: boolean;
  endOffset: number;
}

interface CloseTag {
  kind: "close";
  tagName: string;
  endOffset: number;
}

interface CommentTag {
  kind: "comment";
  endOffset: number;
}

interface DoctypeTag {
  kind: "doctype";
  endOffset: number;
}

type ParsedTag = OpenTag | CloseTag | CommentTag | DoctypeTag;

export function sanitizeAnnotatedHtml(
  input: string,
): SanitizeAnnotatedHtmlResult {
  const warnings: HtmlSanitizerWarning[] = [];
  let output = "";
  let i = 0;

  while (i < input.length) {
    if (input[i] !== "<") {
      output += input[i];
      i += 1;
      continue;
    }

    const tag = parseTag(input, i);
    if (!tag) {
      output += input[i];
      i += 1;
      continue;
    }

    if (tag.kind === "comment" || tag.kind === "doctype") {
      output += input.slice(i, tag.endOffset);
      i = tag.endOffset;
      continue;
    }

    if (tag.kind === "close") {
      const lcName = tag.tagName.toLowerCase();
      if (DISALLOWED_ELEMENTS.has(lcName) || !ALLOWED_ELEMENTS.has(lcName)) {
        i = tag.endOffset;
        continue;
      }
      output += input.slice(i, tag.endOffset);
      i = tag.endOffset;
      continue;
    }

    const lcName = tag.tagName.toLowerCase();

    if (DISALLOWED_ELEMENTS.has(lcName)) {
      warnings.push({
        code: "disallowed-element",
        message: `Removed disallowed <${lcName}> element.`,
      });
      if (tag.selfClosing || VOID_ELEMENTS.has(lcName)) {
        i = tag.endOffset;
        continue;
      }
      const close = findCloseTag(input, tag.endOffset, lcName);
      i = close === null ? input.length : close.tagEnd;
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(lcName)) {
      warnings.push({
        code: "disallowed-element",
        message: `Removed unknown <${lcName}> element.`,
      });
      i = tag.endOffset;
      continue;
    }

    const sanitizedAttrs = sanitizeAttributes(lcName, tag.attrs, warnings);
    const hasLiteral = tag.attrs.some(
      (attr) => attr.name.toLowerCase() === "data-rd-literal",
    );
    const isVoid = tag.selfClosing || VOID_ELEMENTS.has(lcName);
    const isProtected =
      !isVoid && (PROTECTED_ELEMENTS.has(lcName) || hasLiteral);

    output += buildOpenTag(tag.tagName, sanitizedAttrs, tag.selfClosing);

    if (isProtected) {
      const close = findCloseTag(input, tag.endOffset, lcName);
      if (close === null) {
        output += input.slice(tag.endOffset);
        i = input.length;
      } else {
        output += input.slice(tag.endOffset, close.tagEnd);
        i = close.tagEnd;
      }
      continue;
    }

    i = tag.endOffset;
  }

  return { html: output, warnings };
}

function parseTag(input: string, start: number): ParsedTag | null {
  if (input[start] !== "<") return null;

  if (input.startsWith("<!--", start)) {
    const end = input.indexOf("-->", start + 4);
    if (end === -1) return null;
    return { kind: "comment", endOffset: end + 3 };
  }

  if (input.startsWith("<!", start) || input.startsWith("<?", start)) {
    const end = input.indexOf(">", start + 2);
    if (end === -1) return null;
    return { kind: "doctype", endOffset: end + 1 };
  }

  if (input.startsWith("</", start)) {
    let i = start + 2;
    if (!isNameStart(input[i])) return null;
    const nameStart = i;
    while (i < input.length && isNameChar(input[i])) i += 1;
    const tagName = input.slice(nameStart, i);
    while (i < input.length && isWhitespace(input[i])) i += 1;
    if (input[i] !== ">") return null;
    return { kind: "close", tagName, endOffset: i + 1 };
  }

  let i = start + 1;
  if (!isNameStart(input[i])) return null;
  const nameStart = i;
  while (i < input.length && isNameChar(input[i])) i += 1;
  const tagName = input.slice(nameStart, i);

  const attrs: ParsedAttr[] = [];
  let selfClosing = false;

  while (i < input.length) {
    while (i < input.length && isWhitespace(input[i])) i += 1;

    if (input[i] === ">") {
      return { kind: "open", tagName, attrs, selfClosing, endOffset: i + 1 };
    }

    if (input[i] === "/" && input[i + 1] === ">") {
      selfClosing = true;
      return { kind: "open", tagName, attrs, selfClosing, endOffset: i + 2 };
    }

    if (!isAttrNameStart(input[i])) {
      i += 1;
      continue;
    }

    const attrNameStart = i;
    while (i < input.length && isAttrNameChar(input[i])) i += 1;
    const attrName = input.slice(attrNameStart, i);

    let cursor = i;
    while (cursor < input.length && isWhitespace(input[cursor])) cursor += 1;

    if (input[cursor] !== "=") {
      attrs.push({ name: attrName, hasValue: false, value: "", quote: "" });
      continue;
    }

    cursor += 1;
    while (cursor < input.length && isWhitespace(input[cursor])) cursor += 1;

    let value = "";
    let quote: '"' | "'" | "" = "";

    if (input[cursor] === '"' || input[cursor] === "'") {
      quote = input[cursor] as '"' | "'";
      cursor += 1;
      const valueStart = cursor;
      while (cursor < input.length && input[cursor] !== quote) cursor += 1;
      value = input.slice(valueStart, cursor);
      if (input[cursor] === quote) cursor += 1;
    } else {
      const valueStart = cursor;
      while (
        cursor < input.length &&
        !isWhitespace(input[cursor]) &&
        input[cursor] !== ">" &&
        !(input[cursor] === "/" && input[cursor + 1] === ">")
      ) {
        cursor += 1;
      }
      value = input.slice(valueStart, cursor);
    }

    attrs.push({ name: attrName, hasValue: true, value, quote });
    i = cursor;
  }

  return null;
}

function sanitizeAttributes(
  elementLower: string,
  attrs: ParsedAttr[],
  warnings: HtmlSanitizerWarning[],
): ParsedAttr[] {
  const result: ParsedAttr[] = [];

  for (const attr of attrs) {
    const nameLower = attr.name.toLowerCase();

    if (isEventHandlerName(nameLower)) {
      warnings.push({
        code: "disallowed-attribute",
        message: `Removed event handler attribute "${attr.name}".`,
      });
      continue;
    }

    if (nameLower === "style") {
      warnings.push({
        code: "disallowed-attribute",
        message: "Removed inline style attribute.",
      });
      continue;
    }

    if (attr.hasValue && isUrlAttribute(elementLower, nameLower)) {
      if (!isAllowedUrlValue(attr.value, elementLower, nameLower)) {
        warnings.push({
          code: "disallowed-url",
          message: `Removed disallowed URL in <${elementLower} ${nameLower}>.`,
        });
        continue;
      }
    }

    if (!isAttrAllowed(elementLower, nameLower)) {
      warnings.push({
        code: "disallowed-attribute",
        message: `Removed disallowed attribute "${attr.name}" on <${elementLower}>.`,
      });
      continue;
    }

    result.push(attr);
  }

  return result;
}

function isAttrAllowed(elementLower: string, attrLower: string): boolean {
  if (attrLower.startsWith("data-rd-")) return true;
  if (GLOBAL_ALLOWED_ATTRS.has(attrLower)) return true;
  const specific = ELEMENT_ALLOWED_ATTRS[elementLower];
  if (specific?.has(attrLower)) return true;
  return false;
}

function isEventHandlerName(nameLower: string): boolean {
  if (!nameLower.startsWith("on")) return false;
  if (nameLower.length < 3) return false;
  const third = nameLower.charCodeAt(2);
  return third >= 97 && third <= 122;
}

function isUrlAttribute(elementLower: string, attrLower: string): boolean {
  if (
    attrLower === "href" &&
    (elementLower === "a" || elementLower === "link")
  ) {
    return true;
  }
  if (
    attrLower === "src" &&
    (elementLower === "img" || elementLower === "iframe")
  ) {
    return true;
  }
  return false;
}

function isAllowedUrlValue(
  value: string,
  elementLower: string,
  attrLower: string,
): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("javascript:")) return false;
  if (trimmed.startsWith("data:")) {
    if (
      elementLower === "img" &&
      attrLower === "src" &&
      trimmed.startsWith("data:image/")
    ) {
      return true;
    }
    return false;
  }
  return true;
}

function buildOpenTag(
  tagName: string,
  attrs: ParsedAttr[],
  selfClosing: boolean,
): string {
  let result = `<${tagName}`;
  for (const attr of attrs) {
    if (!attr.hasValue) {
      result += ` ${attr.name}`;
      continue;
    }
    const quote = attr.quote || '"';
    result += ` ${attr.name}=${quote}${attr.value}${quote}`;
  }
  result += selfClosing ? "/>" : ">";
  return result;
}

function findCloseTag(
  input: string,
  start: number,
  tagNameLower: string,
): { tagStart: number; tagEnd: number } | null {
  let cursor = start;
  while (cursor < input.length) {
    const next = input.indexOf("</", cursor);
    if (next === -1) return null;

    let j = next + 2;
    const nameStart = j;
    while (j < input.length && isNameChar(input[j])) j += 1;
    const name = input.slice(nameStart, j).toLowerCase();

    if (name !== tagNameLower) {
      cursor = next + 1;
      continue;
    }

    while (j < input.length && isWhitespace(input[j])) j += 1;
    if (input[j] !== ">") {
      cursor = next + 1;
      continue;
    }

    return { tagStart: next, tagEnd: j + 1 };
  }
  return null;
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isNameStart(character: string | undefined): boolean {
  if (!character) return false;
  return /[A-Za-z]/.test(character);
}

function isNameChar(character: string | undefined): boolean {
  if (!character) return false;
  return /[A-Za-z0-9-]/.test(character);
}

function isAttrNameStart(character: string | undefined): boolean {
  if (!character) return false;
  return /[A-Za-z_:]/.test(character);
}

function isAttrNameChar(character: string | undefined): boolean {
  if (!character) return false;
  return /[A-Za-z0-9_:.-]/.test(character);
}
