export interface HtmlElementNode {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  position: number;
}

export interface HtmlTextNode {
  type: "text";
  value: string;
  position: number;
}

export type HtmlNode = HtmlElementNode | HtmlTextNode;

export type HtmlCommentStatus = "open" | "resolved";

export interface HtmlAnnotationComment {
  id: string;
  anchorIds: string[];
  author: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  status: HtmlCommentStatus | null;
  replyTo: string | null;
  body: string;
  position: number;
}

export type HtmlSuggestionKind = "insertion" | "deletion" | "substitution";
export type HtmlSuggestionStatus = "open" | "accepted" | "rejected";

export interface HtmlAnnotationSuggestion {
  id: string;
  kind: HtmlSuggestionKind;
  author: string | null;
  createdAt: string | null;
  status: HtmlSuggestionStatus | null;
  insertedText?: string;
  deletedText?: string;
  position: number;
}

export interface HtmlAnnotationWarning {
  code: string;
  message: string;
}

export interface AnnotatedHtmlDoc {
  format: "annotated-html";
  version: "0.1";
  source: string;
  blocks: HtmlNode[];
  comments: HtmlAnnotationComment[];
  suggestions: HtmlAnnotationSuggestion[];
  warnings: HtmlAnnotationWarning[];
}
