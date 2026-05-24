# 0005: HTML Review Annotation Contract

## Status

Accepted (MVP scope). Supersedes the implicit assumption in ADR 0001–0004 that the on-disk review format is Markdown + CriticMarkup, *only for the HTML-native flow being introduced on this branch*. Markdown/CriticMarkup remain authoritative for `.md` files.

**Shipped (2026-05-23):** Parser, serializer, sanitizer, file backend (read/write), browser review rail (read-only render + click-to-scroll sync), authoring flows (add comment, accept/reject suggestion, multi-id anchors), and MCP tools (`roughdraft_read_html_document`, `roughdraft_add_comment`, `roughdraft_accept_suggestion`, `roughdraft_reject_suggestion`) all implement this contract. End-to-end agent flow evidence: `.context/mcp-evidence/G6.4-agent-flow.transcript.md`. Performance budgets: `packages/rfm/src/html/__tests__/perf-mixed-review.test.ts` and `packages/app/src/editor/html/__tests__/perf-render.test.tsx`.

## Context

Roughdraft is gaining an HTML-native review mode. Documents live on disk as `.html` (or `.htm`) and must remain readable, diffable, and editable by humans, agents, and third-party tools without the Roughdraft app present. CriticMarkup is a Markdown convention and does not survive HTML rendering; we need an HTML-native annotation layer that:

- Renders harmlessly in any modern browser without Roughdraft (graceful degradation: comment bodies are still visible text, anchors highlight as `<mark>`).
- Is unambiguous to parse and round-trip with low diff churn.
- Is safe to ingest: a malicious HTML document must not exfiltrate data or execute scripts when opened in Roughdraft.
- Composes with existing HTML content, including code listings and literal HTML examples.

## Decision

### 1. Comment anchors

A reviewed span of inline content is wrapped in a single `<mark>` element whose `data-rd-comment-ids` attribute lists one or more comment record ids in the order they were created.

```html
<p>The <mark data-rd-comment-ids="c-7uG2">sky</mark> is blue.</p>
```

Rules:

- The attribute value is a space-separated list of stable, opaque ids. Ids are URL-safe `[A-Za-z0-9_-]+` and unique within the document.
- A `<mark>` with no `data-rd-comment-ids` attribute is treated as plain author content and is not a comment anchor.
- `<mark>` is the *only* element used as a comment anchor. Other elements may not carry `data-rd-comment-ids`.
- Anchors may not span block boundaries. To comment on a multi-paragraph region, the author creates one anchor per block and the comment record lists those anchor ids (see `data-rd-anchor-ids` on the record).
- Anchors may not nest. To represent multiple comments on the same span, list all ids in one `data-rd-comment-ids` attribute on a single `<mark>`.

### 2. Comment records

Each comment is a `<rd-comment>` custom element placed in document order, after the block where its primary anchor lives, inside a `<aside class="rd-review" hidden>` container at the end of `<body>`:

```html
<aside class="rd-review" hidden>
  <rd-comment
    id="c-7uG2"
    data-rd-author="ananth@cradlewise.com"
    data-rd-created-at="2026-05-23T10:14:11Z"
    data-rd-anchor-ids="c-7uG2"
    data-rd-status="open"
  >The sky is also sometimes grey.</rd-comment>
</aside>
```

Rules:

- `<rd-comment>` is an [HTML custom element](https://html.spec.whatwg.org/multipage/custom-elements.html). Browsers without Roughdraft render its text body inline; Roughdraft hides the `<aside>` via the `hidden` attribute when rendering its own review rail.
- Required attributes: `id`, `data-rd-author`, `data-rd-created-at` (ISO-8601 UTC), `data-rd-status` (`open` | `resolved`), `data-rd-anchor-ids`.
- Optional attributes: `data-rd-reply-to` (id of parent comment for threads), `data-rd-updated-at`.
- The text content is the comment body. HTML content inside a comment body is restricted to the sanitizer allowlist (see §6). Bodies must escape `<` as `&lt;` etc. per normal HTML rules.
- The `id` of a comment record matches at least one entry in some anchor's `data-rd-comment-ids`. The reverse must also hold: every id referenced by an anchor must have a record.
- Replies (threaded comments) reference their parent via `data-rd-reply-to=<parent-id>` and need not have their own anchor; they may have `data-rd-anchor-ids=""`.

### 3. Suggestions (insertion / deletion / substitution)

Suggestions use the standard HTML semantic elements `<ins>` and `<del>` with Roughdraft attributes:

- **Insertion**: `<ins data-rd-suggestion-id="s-1" data-rd-author="..." data-rd-created-at="...">new text</ins>`
- **Deletion**: `<del data-rd-suggestion-id="s-2" data-rd-author="..." data-rd-created-at="...">old text</del>`
- **Substitution**: a `<del>` immediately followed by an `<ins>` that share the same `data-rd-suggestion-id`.

Rules:

- `data-rd-suggestion-id` is required and unique-per-document.
- Substitutions must be expressed as exactly one `<del>` adjacent to exactly one `<ins>` with the same id, in that order, with no intervening characters other than zero or more whitespace text nodes.
- Suggestions may be commented: a `<mark data-rd-comment-ids>` may wrap a `<del>`, `<ins>`, or substitution pair. The reverse (a suggestion wrapping a comment anchor) is not permitted in MVP.
- Optional `data-rd-status` on `<ins>`/`<del>`: `open` (default), `accepted`, `rejected`. Accepted/rejected suggestions are normally serialized as their resolved form (plain text or removed) — see §7.

### 4. Multiple comments on one span

Multiple comments anchored on the same span are expressed by listing all comment ids on a single `<mark>`:

```html
<p>The <mark data-rd-comment-ids="c-7uG2 c-9aB1">sky</mark> is blue.</p>
```

The corresponding `<rd-comment>` records appear in the `<aside class="rd-review">` in the order they were created, each with `data-rd-anchor-ids` listing this anchor's id-set (typically just its own id; see §2).

### 5. Literal and protected zones

The parser must not interpret review markup inside protected zones. Protected zones are:

- `<script>` and `<style>` element contents.
- `<pre>` element contents (whether or not they contain `<code>`).
- `<code>` element contents (inline or inside `<pre>`).
- Any element with `data-rd-literal` (escape hatch for templated literal HTML examples in docs).

Inside a protected zone:

- `<mark data-rd-comment-ids>`, `<ins data-rd-suggestion-id>`, `<del data-rd-suggestion-id>`, and `<rd-comment>` are treated as plain literal text, not as Roughdraft annotations.
- The serializer must not move, normalize, or rewrite the inner content of protected zones beyond preserving it byte-for-byte.

This makes it safe to write technical documentation that *describes* Roughdraft's HTML annotation format without accidentally annotating the documentation itself.

### 6. Sanitizer allowlist

When ingesting an HTML document the sanitizer enforces an allowlist. Anything outside the allowlist is dropped (element removed, attribute removed) and the operation is logged in the parsed model's `warnings`.

Allowed structural elements (non-exhaustive starter list, finalized in G3.1):

- Block: `html`, `head`, `body`, `meta`, `title`, `link[rel=stylesheet][href]` (same-origin only at write time), `style`, `article`, `section`, `header`, `footer`, `nav`, `main`, `aside`, `div`, `p`, `h1`–`h6`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `blockquote`, `figure`, `figcaption`, `hr`, `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`, `pre`.
- Inline: `a[href]`, `span`, `strong`, `em`, `b`, `i`, `u`, `s`, `code`, `kbd`, `samp`, `var`, `sub`, `sup`, `br`, `img[src][alt]`.
- Review: `mark`, `ins`, `del`, `rd-comment`.

Allowed attributes (global): `id`, `class`, `lang`, `title`, `dir`, `hidden`, plus the `data-rd-*` namespace.

Disallowed by default:

- `<script>` in author content (allowed only in head boot via explicit opt-in, deferred from MVP).
- `on*` event handlers, `javascript:` and `data:` URLs (except `data:image/*` in `img[src]`).
- `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`, `<link rel=preload>` and similar.
- Inline `style` attributes (use class+stylesheet).

The sanitizer is applied on read and on write. A round-trip through Roughdraft normalizes the document to the allowlist; this is acceptable churn explicitly permitted by §7.

### 7. Low-churn serialization

The serializer is **not byte-perfect**. It promises:

- Stable output for a stable model: serializing the same model twice yields identical bytes.
- Bounded churn for a bounded edit: editing one comment, anchor, or suggestion changes only the bytes inside its element and any whitespace immediately adjacent to it, not unrelated regions.
- Whitespace normalization is permitted between block elements; whitespace inside protected zones (§5) is preserved byte-for-byte.
- Attribute order within an element is stable and deterministic (Roughdraft picks a canonical order — TBD in implementation, but stable per parser version).
- Self-closing form: void elements use `<br>` (HTML, not XHTML `<br/>`).

This is the contract referenced by ADR 0003 for Markdown, restated for HTML.

### 8. Document boot and graceful degradation

A Roughdraft-emitted HTML document includes a small `<style>` in `<head>` that:

- Shows `<mark data-rd-comment-ids>` with a soft yellow highlight.
- Hides `<aside class="rd-review">` from non-Roughdraft renderers via the `hidden` attribute *and* a CSS fallback.
- Styles `<ins data-rd-suggestion-id>` and `<del data-rd-suggestion-id>` distinctly.

A document without this boot block is still valid; Roughdraft injects it on the next write if missing.

## Consequences

- Round-trip and mutation contracts are part of the product. New HTML features must add fixture coverage before broad parser/serializer refactors.
- The MCP server exposes only operations expressible through this contract; agent-authored markup outside the contract is rejected by the sanitizer.
- Markdown remains the on-disk format for `.md` files and is unchanged by this ADR.

## What This Explicitly Does Not Mean

- Roughdraft does not promise to preserve every byte of arbitrary input HTML; the sanitizer may legitimately strip disallowed constructs.
- The contract is not a sidecar database. It must remain a single self-contained `.html` file readable in any browser.
- This ADR does not commit to a specific parser library; G1.1 picks one.
- This ADR does not define how the UI renders comments — only how they live on disk.

## Deferred edge cases (revisit in Goal 7)

- Anchors spanning block boundaries (currently disallowed; may be re-enabled with `data-rd-anchor-group`).
- Nested suggestions (a suggestion inside another suggestion).
- Comments anchored to non-text features (an image, a table cell, a heading id).
- Cross-document comment refs (a comment referencing an anchor in another file).
- `<script>` in author content with a Roughdraft-managed allowlist.
- Reactions / emoji on comments.
- Suggestion conflicts (two suggestions overlapping the same span).
- Author identity beyond a free-text string (verified identities, per-org namespaces).
- Internationalized punctuation in attribute values (validated at sanitizer level; tests deferred).
