import { defineConfig } from "vite"
import dts from "vite-plugin-dts"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// @ocai/rune-core is headless. No React plugin, no Tailwind. Bundled as ESM
// library, with Tiptap + ProseMirror kept EXTERNAL so the consumer
// resolves a single copy shared with `@tiptap/react` (and with
// `@ocai/rune-react`, which already externalizes them). Bundling them in
// here produces a second PM instance whose `PluginKey` counter starts
// at 0 alongside `@tiptap/react`'s bundled copy — both mint key
// `"plugin$"` for their first unnamed Plugin (keymap /
// inputRulesPlugin / pasteRulesPlugin), and `EditorState.Configuration`
// rejects the collision with
// `RangeError: Adding different instances of a keyed plugin (plugin$)`.
export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "./tsconfig.json",
      entryRoot: "src",
      include: ["src"],
      outDir: "dist",
    }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: [
        /^@tiptap\//,
        /^prosemirror-/,
        "orderedmap",
        "rope-sequence",
        "w3c-keyname",
        "nanoid",
      ],
    },
    sourcemap: "hidden",
    copyPublicDir: false,
    emptyOutDir: true,
  },
  test: { environment: "jsdom" },
})
