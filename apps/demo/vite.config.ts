import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Relative base so the static build works under any deploy path (Vercel
// production + preview URLs, or a sub-path host). The demo consumes the BUILT
// @ocai/rune-* packages from the workspace (their `exports` point at
// dist/), so run `pnpm -r build` first.
export default defineConfig({
  base: "./",
  plugins: [react()],
})
