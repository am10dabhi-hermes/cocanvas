import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseAnnotatedHtml,
  sanitizeAnnotatedHtml,
  serializeAnnotatedHtml,
} from "../../index.js";

// Performance budgets are intentionally loose so we catch only order-of-
// magnitude regressions, not normal CI jitter. Measured locally:
//   parse(mixed-review-document.html):     ~1-3 ms
//   sanitize(mixed-review-document.html):  ~1-2 ms
//   serialize(parse(mixed)):               ~1 ms
// Budgets are 10x-ish those numbers, scaled up to forgive a busy CI runner.
// Update the budget if measurements consistently drift; do not tighten until
// we have a real signal that today's headroom is causing latent bugs.
const PARSE_BUDGET_MS = 200;
const SANITIZE_BUDGET_MS = 200;
const SERIALIZE_BUDGET_MS = 200;
const ITERATIONS = 50;

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../../../.context/fixtures/html");

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf-8");
}

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe("html performance budgets (mixed-review fixture)", () => {
  const source = readFixture("mixed-review-document.html");

  it(`parse stays under ${PARSE_BUDGET_MS} ms on the mixed-review fixture`, () => {
    // Warm-up to avoid first-call JIT bias.
    parseAnnotatedHtml(source);
    const elapsed = timeMs(() => {
      for (let i = 0; i < ITERATIONS; i += 1) {
        parseAnnotatedHtml(source);
      }
    });
    const perIteration = elapsed / ITERATIONS;
    expect(perIteration).toBeLessThan(PARSE_BUDGET_MS);
  });

  it(`sanitize stays under ${SANITIZE_BUDGET_MS} ms on the mixed-review fixture`, () => {
    sanitizeAnnotatedHtml(source);
    const elapsed = timeMs(() => {
      for (let i = 0; i < ITERATIONS; i += 1) {
        sanitizeAnnotatedHtml(source);
      }
    });
    const perIteration = elapsed / ITERATIONS;
    expect(perIteration).toBeLessThan(SANITIZE_BUDGET_MS);
  });

  it(`serialize(parse(...)) stays under ${SERIALIZE_BUDGET_MS} ms on the mixed-review fixture`, () => {
    const doc = parseAnnotatedHtml(source);
    serializeAnnotatedHtml(doc);
    const elapsed = timeMs(() => {
      for (let i = 0; i < ITERATIONS; i += 1) {
        serializeAnnotatedHtml(doc);
      }
    });
    const perIteration = elapsed / ITERATIONS;
    expect(perIteration).toBeLessThan(SERIALIZE_BUDGET_MS);
  });
});
