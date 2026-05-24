// @vitest-environment node
import { describe, expect, it } from "vitest";
import viteConfigFactory from "../vite.config";

function resolveConfig() {
  const result =
    typeof viteConfigFactory === "function"
      ? viteConfigFactory({ command: "build", mode: "production" })
      : viteConfigFactory;
  return result as {
    build?: {
      chunkSizeWarningLimit?: number;
      rollupOptions?: {
        output?: {
          manualChunks?: unknown;
        };
      };
    };
  };
}

describe("vite production build configuration", () => {
  it("keeps the chunk-size warning limit at the default 1000 kB threshold", () => {
    const config = resolveConfig();
    const limit = config.build?.chunkSizeWarningLimit ?? 500;
    expect(limit).toBeLessThanOrEqual(1000);
  });

  it("splits react and react-dom into a dedicated vendor chunk", () => {
    const config = resolveConfig();
    const manualChunks = config.build?.rollupOptions?.output?.manualChunks;
    expect(manualChunks).toBeDefined();

    const resolveChunk = (id: string): string | undefined => {
      if (typeof manualChunks === "function") {
        const result = (manualChunks as (id: string) => string | undefined)(id);
        return result ?? undefined;
      }
      if (manualChunks && typeof manualChunks === "object") {
        for (const [name, ids] of Object.entries(
          manualChunks as Record<string, string[]>,
        )) {
          if (ids.some((entry) => id.includes(entry))) {
            return name;
          }
        }
      }
      return undefined;
    };

    const reactChunk = resolveChunk("/node_modules/react/index.js");
    const reactDomChunk = resolveChunk("/node_modules/react-dom/index.js");

    expect(reactChunk).toBeTruthy();
    expect(reactDomChunk).toBeTruthy();
    expect(reactChunk).toBe(reactDomChunk);
  });
});
