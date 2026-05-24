import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type {
  AnnotatedHtmlDoc,
  HtmlElementNode,
  HtmlNode,
} from "@roughdraft/rfm";

interface HtmlReadonlyViewProps {
  document: AnnotatedHtmlDoc;
  activeAnchorId?: string | null;
  onAnchorActivate?: (commentIds: string[]) => void;
  anchorRefs?: Map<string, HTMLElement>;
  onSelectionChange?: (selectedText: string) => void;
}

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

const RAIL_ASIDE_CLASS_TOKENS = new Set(["rd-review"]);

function isReviewAside(node: HtmlElementNode): boolean {
  if (node.tag !== "aside") return false;
  const className = node.attrs.class ?? "";
  return className
    .split(/\s+/)
    .some((token) => RAIL_ASIDE_CLASS_TOKENS.has(token));
}

function shouldHideNode(node: HtmlElementNode): boolean {
  if (node.tag === "rd-comment") return true;
  if (isReviewAside(node)) return true;
  return false;
}

function attrsToReact(
  attrs: Record<string, string>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") {
      result.className = value;
      continue;
    }
    if (key === "for") {
      result.htmlFor = value;
      continue;
    }
    result[key] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    result[key] = value;
  }
  return result;
}

function renderNode(
  node: HtmlNode,
  key: string,
  context: {
    activeAnchorId?: string | null;
    onAnchorActivate?: (commentIds: string[]) => void;
    anchorRefs?: Map<string, HTMLElement>;
  },
): ReactNode {
  if (node.type === "text") {
    return <Fragment key={key}>{node.value}</Fragment>;
  }

  if (shouldHideNode(node)) {
    return null;
  }

  const children = node.children
    .map((child, index) =>
      renderNode(child, `${key}.${index.toString()}`, context),
    )
    .filter((child): child is ReactNode => child !== null);

  const tag = node.tag;

  if (tag === "mark" && Object.hasOwn(node.attrs, "data-rd-comment-ids")) {
    const ids = node.attrs["data-rd-comment-ids"] ?? "";
    const idList = ids.split(/\s+/).filter(Boolean);
    const isActive =
      context.activeAnchorId !== null &&
      context.activeAnchorId !== undefined &&
      idList.includes(context.activeAnchorId);

    const extra: Record<string, unknown> = {
      "data-testid": "comment-anchor",
      "data-active": isActive ? "true" : "false",
      tabIndex: 0,
      onClick: () => context.onAnchorActivate?.(idList),
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          context.onAnchorActivate?.(idList);
        }
      },
      ref: (element: HTMLElement | null) => {
        if (!context.anchorRefs) return;
        if (element) {
          for (const id of idList) {
            context.anchorRefs.set(id, element);
          }
        } else {
          for (const id of idList) {
            context.anchorRefs.delete(id);
          }
        }
      },
    };

    return (
      <mark key={key} {...attrsToReact(node.attrs, extra)}>
        {children}
      </mark>
    );
  }

  const props = attrsToReact(node.attrs);

  if (VOID_TAGS.has(tag)) {
    return wrapVoid(tag, props, key);
  }

  return wrapElement(tag, props, children, key);
}

function wrapVoid(
  tag: string,
  props: Record<string, unknown>,
  key: string,
): ReactNode {
  const Tag = tag as unknown as "br";
  return <Tag key={key} {...(props as object)} />;
}

function wrapElement(
  tag: string,
  props: Record<string, unknown>,
  children: ReactNode[],
  key: string,
): ReactNode {
  const Tag = tag as unknown as "div";
  return (
    <Tag key={key} {...(props as object)}>
      {children}
    </Tag>
  );
}

export function HtmlReadonlyView({
  document: doc,
  activeAnchorId = null,
  onAnchorActivate,
  anchorRefs,
  onSelectionChange,
}: HtmlReadonlyViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const reportSelection = useCallback(() => {
    if (!onSelectionChange) return;
    const container = containerRef.current;
    const selection =
      typeof window !== "undefined" ? window.getSelection() : null;
    if (!container || !selection || selection.rangeCount === 0) {
      onSelectionChange("");
      return;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const withinContainer =
      (anchorNode !== null && container.contains(anchorNode)) ||
      (focusNode !== null && container.contains(focusNode));
    if (!withinContainer) {
      return;
    }
    const text = selection.toString();
    onSelectionChange(text);
  }, [onSelectionChange]);

  useEffect(() => {
    if (!onSelectionChange) return;
    const handler = () => {
      reportSelection();
    };
    window.document.addEventListener("selectionchange", handler);
    return () => {
      window.document.removeEventListener("selectionchange", handler);
    };
  }, [reportSelection, onSelectionChange]);

  return (
    <div
      ref={containerRef}
      data-testid="html-readonly-view"
      contentEditable={false}
      suppressContentEditableWarning
      className="prose max-w-none focus:outline-none"
    >
      {doc.blocks.map((node, index) =>
        renderNode(node, `block.${index.toString()}`, {
          activeAnchorId,
          onAnchorActivate,
          anchorRefs,
        }),
      )}
    </div>
  );
}
