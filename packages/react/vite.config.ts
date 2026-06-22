import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import dts from "vite-plugin-dts"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// @ocai/rune-react = default Rune editor UI. Hooks + components + Tailwind
// tokens + Radix primitives. CSS is emitted as a separate file
// consumers import via "@ocai/rune-react/style.css". cssMinify uses esbuild
// — lightningcss rejects ::selection:window-inactive which the editor
// needs for WebKit blur behavior.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
  plugins: [
    react(),
    tailwindcss(),
    dts({
      tsconfigPath: "./tsconfig.json",
      entryRoot: "src",
      include: ["src"],
      outDir: "dist",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    lib: {
      // Two entries:
      // - index: the browser-facing component library
      // - vite:  a Node-only Vite plugin for self-hosting emojibase data.
      //   Lives at a subpath so consumers can `import { emojibase } from
      //   "@ocai/rune-react/vite"` without dragging Node built-ins
      //   into the browser bundle.
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        vite: path.resolve(__dirname, "src/vite.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: "style",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom/client",
        "@ocai/rune-core",
        // Tiptap's React entry is large and we re-export pieces of it.
        // Keep external so consumers dedupe against any direct usage,
        // and so @ocai/rune-core's bundled Tiptap copy doesn't get a sibling.
        "@tiptap/react",
        "@tiptap/core",
        "@tiptap/pm",
        /^@tiptap\/pm\//,
        // UI libs — heavy, consumers likely already have them, and
        // dedup wins if we keep them external. All declared as deps so
        // pnpm installs them transitively into the consumer.
        "radix-ui",
        /^@radix-ui\//,
        "clsx",
        "tailwind-merge",
        "katex",
        // Vite helper deps — only loaded when the consumer imports from
        // `@ocai/rune-react/vite`. Both are optional peer deps.
        "vite",
        "emojibase-data",
        /^emojibase-data\//,
        /^node:/,
      ],
    },
    sourcemap: "hidden",
    cssMinify: "esbuild",
    copyPublicDir: false,
    emptyOutDir: true,
  },
})
