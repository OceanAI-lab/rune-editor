// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import katex from "katex"

const CACHE_LIMIT = 200
// JS Map preserves insertion order; delete-then-set on hit moves the entry
// to the most-recent slot, and the oldest entry is `cache.keys().next()`.
const cache = new Map<string, string>()

export interface RenderKatexOptions {
  displayMode: boolean
}

export function renderKatexToString(
  latex: string,
  options: RenderKatexOptions,
): string {
  // Empty-state placeholder is a NodeView concern (see
  // InlineMathNodeView + MathEmptyState). This function is only
  // responsible for non-empty LaTeX → KaTeX HTML.

  const key = `${options.displayMode ? "block" : "inline"}\0${latex}`
  const cached = cache.get(key)
  if (cached !== undefined) {
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }

  const html = katex.renderToString(latex, {
    displayMode: options.displayMode,
    throwOnError: false,
    strict: false,
    output: "htmlAndMathml",
  })
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, html)
  return html
}

export type RenderKatexResult =
  | { ok: true; html: string }
  | { ok: false; message: string }

const safeCache = new Map<string, RenderKatexResult>()

/**
 * Render LaTeX with structured error capture. Unlike
 * `renderKatexToString` (which uses `throwOnError: false` and emits
 * KaTeX's red-highlighted error HTML), this variant catches
 * `ParseError` and returns the raw message so the block-equation
 * NodeView can paint its own banner + popover footer.
 *
 * The error check uses `err instanceof Error` rather than
 * `instanceof katex.ParseError` because `katex.ParseError` is not part
 * of KaTeX's published TypeScript types and importing it requires
 * `// @ts-expect-error`. All KaTeX runtime errors inherit from
 * `Error`, and the regex prefix-strip is what discriminates KaTeX
 * parse errors from other failures.
 */
export function renderKatexSafe(
  latex: string,
  options: RenderKatexOptions,
): RenderKatexResult {
  const key = `safe\0${options.displayMode ? "block" : "inline"}\0${latex}`
  const cached = safeCache.get(key)
  if (cached !== undefined) {
    safeCache.delete(key)
    safeCache.set(key, cached)
    return cached
  }
  let result: RenderKatexResult
  try {
    const html = katex.renderToString(latex, {
      displayMode: options.displayMode,
      throwOnError: true,
      strict: false,
      output: "htmlAndMathml",
    })
    result = { ok: true, html }
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Invalid equation"
    const message = raw.replace(/^KaTeX parse error:\s*/, "")
    result = { ok: false, message }
  }
  if (safeCache.size >= CACHE_LIMIT) {
    const oldest = safeCache.keys().next().value
    if (oldest !== undefined) safeCache.delete(oldest)
  }
  safeCache.set(key, result)
  return result
}
