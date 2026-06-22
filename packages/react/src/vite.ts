// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import type { Plugin } from "vite"

export interface EmojibasePluginOptions {
  /**
   * Locales to serve / bundle. Defaults to `["en"]`. Each locale must be
   * installed as part of the `emojibase-data` package.
   */
  locales?: string[]
  /**
   * URL path the picker fetches from. The plugin serves
   * `<base>/<locale>/data.json` and `<base>/<locale>/messages.json` in dev
   * (via Vite middleware) and emits the same files at the same path in
   * the production build. Defaults to `/emojibase`. The value should be
   * passed as `emojibaseUrl` to `<EmojiPicker>` / `<RuneEmojiPicker>`.
   */
  base?: string
}

/**
 * Vite plugin that serves the `emojibase-data` JSON locally — both at dev
 * time (via middleware) and in the production build (emitted as assets).
 *
 * Use this when the host environment can't reach the default jsdelivr CDN
 * — e.g. an Electron renderer with strict `connect-src 'self'`, or an
 * intranet without internet egress.
 *
 * Consumer setup:
 *
 * ```ts
 * // vite.config.ts
 * import { emojibase } from "@ocai/rune-react/vite"
 * export default defineConfig({
 *   plugins: [emojibase()],
 * })
 *
 * // somewhere in the app
 * <EmojiPicker emojibaseUrl="/emojibase" ... />
 * ```
 *
 * Requires `emojibase-data` and `vite` to be installed by the consumer
 * (both declared as optional peer dependencies of `@ocai/rune-react`).
 */
export function emojibase(options: EmojibasePluginOptions = {}): Plugin {
  const locales = options.locales ?? ["en"]
  // Strip trailing/leading slashes from base; we'll re-add them where needed.
  const base = `/${(options.base ?? "/emojibase")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")}`
  const require = createRequire(import.meta.url)
  const resolveFile = (locale: string, file: "data" | "messages") =>
    require.resolve(`emojibase-data/${locale}/${file}.json`)

  return {
    name: "rune-react:emojibase",

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url
        if (!url || !url.startsWith(`${base}/`)) return next()
        // Strip an optional querystring (e.g. ?v=hash) before matching.
        const path = url.slice(base.length + 1).split("?")[0] ?? ""
        const match = path.match(/^([^/]+)\/(data|messages)\.json$/)
        if (!match) return next()
        const locale = match[1]!
        const file = match[2]! as "data" | "messages"
        if (!locales.includes(locale)) return next()
        try {
          const body = await readFile(resolveFile(locale, file), "utf-8")
          res.setHeader("Content-Type", "application/json")
          res.setHeader("Cache-Control", "no-cache")
          res.end(body)
        } catch (err) {
          next(err as Error)
        }
      })
    },

    async generateBundle() {
      // Emit one asset per (locale × file). Vite places them under the
      // build's `assetsDir`-relative path we pass here, with the leading
      // slash stripped so the final URL matches `<base>/<locale>/<file>`.
      for (const locale of locales) {
        for (const file of ["data", "messages"] as const) {
          const source = await readFile(resolveFile(locale, file), "utf-8")
          this.emitFile({
            type: "asset",
            fileName: `${base.replace(/^\//, "")}/${locale}/${file}.json`,
            source,
          })
        }
      }
    },
  }
}
