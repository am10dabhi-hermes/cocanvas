import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(() => {
  const apiPort = parseInt(process.env.API_PORT || "3001", 10);

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return undefined;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
              return "react-vendor";
            }
            if (/node_modules\/(@codemirror|codemirror)\//.test(id)) {
              return "codemirror-vendor";
            }
            if (
              /node_modules\/(@tiptap|prosemirror-[^/]+|@joplin\/turndown-plugin-gfm|turndown|marked)\//.test(
                id,
              )
            ) {
              return "editor-vendor";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
