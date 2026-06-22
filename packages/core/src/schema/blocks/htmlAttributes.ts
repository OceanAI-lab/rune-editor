// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Per-key style overrides to merge onto the inherited `HTMLAttributes.style`.
 *
 * Designed for CSS custom properties (e.g. `"--block-pad-top"`) but accepts
 * any CSS property name; the helper writes whatever key it gets. Keys with
 * `null` / `undefined` values are skipped. When a key already exists in the
 * inherited style, the override replaces the value in place; new keys are
 * appended.
 */
type StyleVars = Record<string, string | number | null | undefined>

export interface MergeBlockHTMLAttributesOptions {
  /** Extra block-specific class tokens. `rune-block` is always injected by
   *  the helper and does not need to be passed here. */
  className?: string
  /** Per-key style overrides. See {@link StyleVars} for semantics. */
  styleVars?: StyleVars
}

/**
 * Merge a block's outer `HTMLAttributes` (the object Tiptap hands to a
 * `renderDOM` implementation) with block-specific class/style additions,
 * preserving everything the factory already stamped:
 *
 * - `data-id` / `data-depth` and any other foreign attrs pass through
 *   untouched.
 * - `class` always gains `rune-block` (the side-menu host ancestor and the
 *   anchor for `.rune-block`-scoped decoration CSS); any inherited tokens
 *   are kept; the caller's `options.className` is appended; duplicate
 *   tokens are deduplicated.
 * - `style` is parsed key-by-key, the caller's `options.styleVars` is
 *   merged in (override-in-place for existing keys, append for new), and
 *   the result is reserialized. This is the failure mode the helper exists
 *   to prevent: a naive `style: "--block-pad-top: ..."` clobbered Tiptap's
 *   `--rune-block-depth: N` and the block rendered without visual indent
 *   even though the depth attr did update.
 *
 * Every factory-built block whose `renderDOM` needs to add its own class or
 * inline style should call this — see the draggable-blocks contract test
 * (`depth-style-merge.test.ts`).
 */
export function mergeBlockHTMLAttributes(
  HTMLAttributes: Record<string, any>,
  options: MergeBlockHTMLAttributesOptions = {},
): Record<string, any> {
  const {
    class: htmlClass,
    className: htmlClassName,
    style: htmlStyle,
    ...rest
  } = HTMLAttributes
  const className = mergeClasses("rune-block", htmlClass, htmlClassName, options.className)
  const style = mergeStyleVars(htmlStyle, options.styleVars)

  return {
    ...rest,
    class: className,
    ...(style ? { style } : {}),
  }
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

function mergeStyleVars(style: unknown, vars: StyleVars | undefined): string | undefined {
  const entries = parseStyle(style)
  const index = new Map(entries.map(([key], i) => [key, i]))

  if (vars) {
    for (const [key, rawValue] of Object.entries(vars)) {
      if (rawValue == null) continue
      const value = String(rawValue)
      const existing = index.get(key)
      if (existing === undefined) {
        index.set(key, entries.length)
        entries.push([key, value])
      } else {
        entries[existing] = [key, value]
      }
    }
  }

  if (entries.length === 0) return undefined
  return entries.map(([key, value]) => `${key}: ${value};`).join(" ")
}

function parseStyle(style: unknown): Array<[string, string]> {
  if (typeof style === "string") {
    return style
      .split(";")
      .map((decl): [string, string] | null => {
        const idx = decl.indexOf(":")
        if (idx < 0) return null
        const key = decl.slice(0, idx).trim()
        const value = decl.slice(idx + 1).trim()
        return key ? [key, value] : null
      })
      .filter((entry): entry is [string, string] => entry !== null)
  }

  if (style && typeof style === "object") {
    return Object.entries(style as Record<string, unknown>)
      .filter(([, value]) => value != null)
      .map(([key, value]) => [key, String(value)])
  }

  return []
}
