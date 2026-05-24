import type { AnnotatedHtmlDoc } from "./types.js";

// G2.1: identity serializer for plain HTML. When no mutations have occurred,
// the model still carries the original `source`, and the low-churn contract
// (ADR 0005 §7) is satisfied by emitting it verbatim. A tree-walking
// serializer that handles mutations lands in later chunks (G2.2+).
export function serializeAnnotatedHtml(doc: AnnotatedHtmlDoc): string {
  return doc.source;
}
