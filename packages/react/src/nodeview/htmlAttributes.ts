// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { CSSProperties } from "react"

/**
 * Normalise the `style` field of a React NodeView's `HTMLAttributes` into a
 * `CSSProperties` object that can be spread into JSX.
 *
 * Tiptap stamps attribute-derived inline style as a CSS string (notably the
 * `--rune-block-depth: N` produced by the shared `depth` attr's renderHTML),
 * but a NodeView may also receive an already-parsed object or `undefined`.
 * Without this coercion, the string variant silently disappears when spread
 * into a React `style` prop and the block renders without its inherited
 * factory styling (e.g. drag-into-list leaves depth at zero).
 *
 * Prefer {@link mergeNodeViewHTMLAttributes} when assembling the wrapper's
 * full `{ className, style }` — this helper is the low-level primitive.
 */
export function coerceNodeViewStyle(value: unknown): CSSProperties {
  if (typeof value === "string") return parseInlineStyle(value)
  if (value == null) return {}
  return value as CSSProperties
}

function parseInlineStyle(css: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of css.split(";")) {
    const idx = decl.indexOf(":")
    if (idx < 0) continue
    const key = decl.slice(0, idx).trim()
    const val = decl.slice(idx + 1).trim()
    if (key) out[key] = val
  }
  return out as CSSProperties
}

/**
 * Per-key style overrides to merge onto the inherited NodeView style.
 *
 * Designed for CSS custom properties (e.g. `"--block-pad-top"`) but accepts
 * any CSS property name. `null` / `undefined` values are skipped. When a key
 * already exists in the inherited style, the override wins on conflict.
 */
type StyleVars = Record<string, string | number | null | undefined>

export interface MergeNodeViewHTMLAttributesOptions {
  /** Extra block-specific class tokens. `rune-block` is always injected. */
  className?: string
  /** Per-key style overrides. See {@link StyleVars} for semantics. */
  styleVars?: StyleVars
}

export interface MergedNodeViewHTMLAttributes {
  /** Merged `class` for the wrapper. Includes `rune-block` and any
   *  inherited or caller-supplied class tokens, deduplicated. */
  className: string
  /** Merged `style` for the wrapper. Inherited style preserved key-by-key
   *  with caller's `styleVars` taking precedence. */
  style: CSSProperties
  /** Other passthrough attrs (e.g. `data-id`, `data-depth`) — spread these
   *  onto `<NodeViewWrapper>`. */
  rest: Record<string, unknown>
}

/**
 * React counterpart of core's `mergeBlockHTMLAttributes`. Given the
 * `HTMLAttributes` Tiptap forwards into a React NodeView, return the
 * `{ className, style, rest }` triple ready to spread onto the wrapper:
 *
 * ```tsx
 * const { className, style, rest } = mergeNodeViewHTMLAttributes(
 *   props.HTMLAttributes,
 *   { styleVars: { "--block-pad-top": "var(--rune-media-pad-top)" } },
 * )
 * return <NodeViewWrapper {...rest} className={className} style={style}>…</NodeViewWrapper>
 * ```
 *
 * Guarantees:
 * - `className` always contains `rune-block` (the side-menu host ancestor
 *   and the anchor for `.rune-block`-targeted decoration CSS — see the
 *   project_react_nodeview_decoration_renderer_element memory).
 * - Inherited `style` is coerced through {@link coerceNodeViewStyle}, so
 *   the string form Tiptap produces for `--rune-block-depth` survives.
 * - Caller's `styleVars` are merged AFTER inherited keys; on conflict the
 *   caller wins.
 *
 * Pair with the React-side draggable-blocks contract test.
 */
export function mergeNodeViewHTMLAttributes(
  HTMLAttributes: Record<string, unknown>,
  options: MergeNodeViewHTMLAttributesOptions = {},
): MergedNodeViewHTMLAttributes {
  const {
    class: htmlClass,
    className: htmlClassName,
    style: htmlStyle,
    ...rest
  } = HTMLAttributes as {
    class?: unknown
    className?: unknown
    style?: unknown
    [k: string]: unknown
  }

  const className = mergeClasses("rune-block", htmlClass, htmlClassName, options.className)

  const inherited = coerceNodeViewStyle(htmlStyle)
  const style: CSSProperties = { ...inherited }
  if (options.styleVars) {
    for (const [key, value] of Object.entries(options.styleVars)) {
      if (value == null) continue
      ;(style as Record<string, string>)[key] = String(value)
    }
  }

  return { className, style, rest }
}

function mergeClasses(...values: Array<unknown>): string {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== "string") continue
    for (const token of value.trim().split(/\s+/)) {
      if (!token || seen.has(token)) continue
      seen.add(token)
      out.push(token)
    }
  }
  return out.join(" ")
}
