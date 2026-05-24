import { describe, expect, it } from "vitest";

import {
  type HtmlSanitizerWarning,
  sanitizeAnnotatedHtml,
} from "../../index.js";

function codes(warnings: HtmlSanitizerWarning[]): string[] {
  return warnings.map((warning) => warning.code);
}

function expectWarningCode(
  warnings: HtmlSanitizerWarning[],
  code: string,
): void {
  expect(
    warnings.some((warning) => warning.code === code),
    `expected a warning with code "${code}", got: ${JSON.stringify(codes(warnings))}`,
  ).toBe(true);
}

describe("sanitizeAnnotatedHtml — ADR 0005 §6 allowlist", () => {
  describe("disallowed elements", () => {
    it("strips <script> in body and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<body><p>Hello.</p><script>alert("xss")</script></body>',
      );

      expect(html).not.toMatch(/<script/i);
      expect(html).not.toContain('alert("xss")');
      expect(html).toContain("Hello.");
      expectWarningCode(warnings, "disallowed-element");
    });

    it("strips <iframe> and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p>Before</p><iframe src="https://evil.example/"></iframe><p>After</p>',
      );

      expect(html).not.toMatch(/<iframe/i);
      expect(html).toContain("Before");
      expect(html).toContain("After");
      expectWarningCode(warnings, "disallowed-element");
    });

    it.each([
      ["object", '<object data="https://evil.example/">x</object>'],
      ["embed", '<embed src="https://evil.example/">'],
      ["form", '<form action="/x"><p>inside</p></form>'],
      ["input", '<input type="text" name="x">'],
      ["button", "<button>Click</button>"],
      ["select", "<select><option>a</option></select>"],
      ["textarea", "<textarea>hi</textarea>"],
    ])("strips <%s> and records a warning", (tag, fragment) => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        `<p>Before</p>${fragment}<p>After</p>`,
      );

      expect(html.toLowerCase()).not.toContain(`<${tag}`);
      expect(html).toContain("Before");
      expect(html).toContain("After");
      expectWarningCode(warnings, "disallowed-element");
    });
  });

  describe("disallowed attributes", () => {
    it("strips on* event-handler attributes and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p onclick="steal()" onmouseover="more()">Hi</p>',
      );

      expect(html).not.toMatch(/onclick/i);
      expect(html).not.toMatch(/onmouseover/i);
      expect(html).not.toContain("steal()");
      expect(html).toContain("<p");
      expect(html).toContain("Hi");
      expectWarningCode(warnings, "disallowed-attribute");
    });

    it("strips inline style attributes and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p style="color:red">Hi</p>',
      );

      expect(html).not.toMatch(/style=/i);
      expect(html).toContain("Hi");
      expectWarningCode(warnings, "disallowed-attribute");
    });

    it("keeps allowed global attributes (id, class, lang, title, dir, hidden)", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p id="p1" class="lead" lang="en" title="t" dir="ltr" hidden>Hi</p>',
      );

      expect(html).toContain('id="p1"');
      expect(html).toContain('class="lead"');
      expect(html).toContain('lang="en"');
      expect(html).toContain('title="t"');
      expect(html).toContain('dir="ltr"');
      expect(html).toMatch(/hidden(=|\s|>)/);
      expect(warnings).toEqual([]);
    });

    it("keeps the data-rd-* namespace on review elements", () => {
      const html = [
        '<p>The <mark data-rd-comment-ids="c-1">sky</mark> is blue.</p>',
        '<ins data-rd-suggestion-id="s-1" data-rd-author="a" data-rd-created-at="2026-05-23T00:00:00Z">new</ins>',
        '<del data-rd-suggestion-id="s-2" data-rd-author="a" data-rd-created-at="2026-05-23T00:00:00Z">old</del>',
        '<aside class="rd-review" hidden>',
        '<rd-comment id="c-1" data-rd-author="a" data-rd-created-at="2026-05-23T00:00:00Z" data-rd-anchor-ids="c-1" data-rd-status="open">Body.</rd-comment>',
        "</aside>",
      ].join("");

      const result = sanitizeAnnotatedHtml(html);

      expect(result.html).toContain('data-rd-comment-ids="c-1"');
      expect(result.html).toContain('data-rd-suggestion-id="s-1"');
      expect(result.html).toContain('data-rd-suggestion-id="s-2"');
      expect(result.html).toContain('data-rd-anchor-ids="c-1"');
      expect(result.html).toContain('data-rd-status="open"');
      expect(result.html).toContain("<rd-comment");
      expect(result.warnings).toEqual([]);
    });
  });

  describe("URL scheme handling", () => {
    it("strips javascript: URLs from a[href] and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<a href="javascript:alert(1)">click</a>',
      );

      expect(html).not.toMatch(/javascript:/i);
      expect(html).toContain("click");
      expectWarningCode(warnings, "disallowed-url");
    });

    it("strips javascript: URLs from img[src] and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<img src="javascript:alert(1)" alt="x">',
      );

      expect(html).not.toMatch(/javascript:/i);
      expectWarningCode(warnings, "disallowed-url");
    });

    it("strips non-image data: URLs from a[href] and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      );

      expect(html).not.toMatch(/href="data:/i);
      expect(html).toContain("x");
      expectWarningCode(warnings, "disallowed-url");
    });

    it("strips non-image data: URLs from img[src] and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<img src="data:text/html,<b>nope</b>" alt="x">',
      );

      expect(html).not.toMatch(/src="data:/i);
      expectWarningCode(warnings, "disallowed-url");
    });

    it("keeps data:image/* in img[src]", () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX/AAAZ4gk3AAAAAXRSTlMAQObYZgAAAAtJREFUCNdjYAAAAAIAAUivpHEAAAAASUVORK5CYII=";

      const { html, warnings } = sanitizeAnnotatedHtml(
        `<img src="${dataUrl}" alt="px">`,
      );

      expect(html).toContain(`src="${dataUrl}"`);
      expect(html).toContain('alt="px"');
      expect(warnings).toEqual([]);
    });
  });

  describe("protected / literal zones", () => {
    it("preserves <pre> body bytes verbatim, including annotation-looking text", () => {
      const inner =
        '<mark data-rd-comment-ids="c-not-real">sky</mark> &amp; sea\n  with    spacing';
      const { html, warnings } = sanitizeAnnotatedHtml(`<pre>${inner}</pre>`);

      expect(html).toContain(`<pre>${inner}</pre>`);
      expect(warnings).toEqual([]);
    });

    it("preserves <code> body bytes verbatim", () => {
      const inner = '<ins data-rd-suggestion-id="s-not-real">x</ins>';
      const { html, warnings } = sanitizeAnnotatedHtml(`<code>${inner}</code>`);

      expect(html).toContain(`<code>${inner}</code>`);
      expect(warnings).toEqual([]);
    });

    it("preserves data-rd-literal body bytes verbatim", () => {
      const inner =
        '<rd-comment id="c-not-real" data-rd-author="x">literal example</rd-comment>';
      const { html, warnings } = sanitizeAnnotatedHtml(
        `<div data-rd-literal>${inner}</div>`,
      );

      expect(html).toContain(inner);
      expect(warnings).toEqual([]);
    });

    it("still sanitizes dangerous attributes on the outer tag of a protected element", () => {
      const inner = "console.log('hi')";
      const { html, warnings } = sanitizeAnnotatedHtml(
        `<pre onclick="steal()" style="color:red">${inner}</pre>`,
      );

      expect(html).toContain(inner);
      expect(html).toContain("<pre");
      expect(html).not.toMatch(/onclick/i);
      expect(html).not.toMatch(/style=/i);
      expectWarningCode(warnings, "disallowed-attribute");
    });
  });

  describe("element allowlist (ADR §6)", () => {
    it("strips unknown elements outside the allowlist and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p>Before</p><marquee behavior="scroll">flash</marquee><p>After</p>',
      );

      expect(html.toLowerCase()).not.toContain("<marquee");
      expect(html.toLowerCase()).not.toContain("behavior=");
      expect(html).toContain("flash");
      expect(html).toContain("Before");
      expect(html).toContain("After");
      expectWarningCode(warnings, "disallowed-element");
    });

    it("strips unknown self-closing elements outside the allowlist", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        "<p>Before</p><custom-thing/><p>After</p>",
      );

      expect(html.toLowerCase()).not.toContain("<custom-thing");
      expect(html).toContain("Before");
      expect(html).toContain("After");
      expectWarningCode(warnings, "disallowed-element");
    });

    it("keeps the ADR structural and inline allowlisted elements", () => {
      const fragment = [
        "<article>",
        "<h1>Title</h1>",
        "<h2>Subtitle</h2>",
        "<p>A <strong>bold</strong> <em>emphasized</em> phrase with <code>code</code>, ",
        "<kbd>Ctrl</kbd>+<kbd>C</kbd>, <samp>output</samp>, <var>x</var>, ",
        "H<sub>2</sub>O, x<sup>2</sup>, line<br>break.</p>",
        "<blockquote>quote</blockquote>",
        "<ul><li>one</li><li>two</li></ul>",
        "<ol><li>a</li></ol>",
        "<figure><figcaption>Figure 1</figcaption></figure>",
        "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table>",
        "</article>",
      ].join("");

      const { html, warnings } = sanitizeAnnotatedHtml(fragment);

      expect(warnings).toEqual([]);
      expect(html).toContain("<article>");
      expect(html).toContain("<h1>Title</h1>");
      expect(html).toContain("<h2>Subtitle</h2>");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<em>emphasized</em>");
      expect(html).toContain("<code>code</code>");
      expect(html).toContain("<kbd>Ctrl</kbd>");
      expect(html).toContain("<samp>output</samp>");
      expect(html).toContain("<var>x</var>");
      expect(html).toContain("<sub>2</sub>");
      expect(html).toContain("<sup>2</sup>");
      expect(html).toContain("<br>");
      expect(html).toContain("<blockquote>quote</blockquote>");
      expect(html).toContain("<figure>");
      expect(html).toContain("<figcaption>Figure 1</figcaption>");
      expect(html).toContain("<table>");
      expect(html).toContain("<thead>");
      expect(html).toContain("<tbody>");
      expect(html).toContain("<th>h</th>");
      expect(html).toContain("<td>v</td>");
    });
  });

  describe("attribute allowlist (ADR §6)", () => {
    it("strips non-allowlisted attributes from allowed elements and records a warning", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p aria-label="x" role="note" spellcheck="true" data-user="x">Hi</p>',
      );

      expect(html).toContain("Hi");
      expect(html).toMatch(/<p\s*>|<p>/);
      expect(html).not.toMatch(/aria-label/i);
      expect(html).not.toMatch(/\brole=/i);
      expect(html).not.toMatch(/spellcheck/i);
      expect(html).not.toMatch(/data-user/i);
      expectWarningCode(warnings, "disallowed-attribute");
    });

    it("keeps element-specific attributes only on the elements they belong to", () => {
      const { html: anchorHtml, warnings: anchorWarnings } =
        sanitizeAnnotatedHtml('<a href="/safe">link</a>');
      expect(anchorHtml).toContain('href="/safe"');
      expect(anchorWarnings).toEqual([]);

      const { html: imgHtml, warnings: imgWarnings } = sanitizeAnnotatedHtml(
        '<img src="/safe.png" alt="hi">',
      );
      expect(imgHtml).toContain('src="/safe.png"');
      expect(imgHtml).toContain('alt="hi"');
      expect(imgWarnings).toEqual([]);

      const { html: pHtml, warnings: pWarnings } = sanitizeAnnotatedHtml(
        '<p href="/x" src="/y" alt="z">Hi</p>',
      );
      expect(pHtml).toContain("Hi");
      expect(pHtml).not.toMatch(/href=/i);
      expect(pHtml).not.toMatch(/\bsrc=/i);
      expect(pHtml).not.toMatch(/\balt=/i);
      expectWarningCode(pWarnings, "disallowed-attribute");
    });
  });

  describe("warning shape", () => {
    it("returns typed warnings with code and message strings", () => {
      const { warnings } = sanitizeAnnotatedHtml(
        '<p onclick="x()"><script>y()</script></p>',
      );

      expect(warnings.length).toBeGreaterThan(0);
      for (const warning of warnings) {
        expect(typeof warning.code).toBe("string");
        expect(warning.code.length).toBeGreaterThan(0);
        expect(typeof warning.message).toBe("string");
        expect(warning.message.length).toBeGreaterThan(0);
      }
    });

    it("returns an empty warnings list for input that is already clean", () => {
      const { html, warnings } = sanitizeAnnotatedHtml(
        '<p id="p1" class="lead">Hello <strong>world</strong>.</p>',
      );

      expect(html).toContain("Hello");
      expect(html).toContain("<strong>world</strong>");
      expect(warnings).toEqual([]);
    });
  });
});
