// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RuneInPlaceAttr } from "../../schema"

export const MIN_CONTENT_WIDTH = 10
export const MAX_CONTENT_WIDTH = 100

export function normalizeContentWidth(value: unknown): number | null {
  if (value == null) return null
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.max(
    MIN_CONTENT_WIDTH,
    Math.min(MAX_CONTENT_WIDTH, Math.round(value)),
  )
}

export function inputContentWidthOrDefault(
  value: unknown,
  fallback: unknown,
): number | null {
  if (value === undefined) return normalizeContentWidth(fallback)
  return normalizeContentWidth(value)
}

export function applyContentWidthAttrs(
  attrs: Record<string, string>,
  rawWidth: unknown,
): number | null {
  const width = normalizeContentWidth(rawWidth)
  if (width === null) return null
  attrs.style = mergeInlineStyle(attrs.style, `width: ${width}%;`)
  attrs["data-rune-resized"] = ""
  return width
}

export function parseContentWidthAttrs(el: HTMLElement): number | null {
  if (!el.hasAttribute("data-rune-resized")) return null
  const width = el.style.width || widthFromStyleAttr(el.getAttribute("style"))
  if (!width.endsWith("%")) return null
  return normalizeContentWidth(Number.parseFloat(width))
}

/**
 * In-place NodeView application for the `contentWidth` attr (live mirror
 * of `applyContentWidthAttrs`, which covers the render path). Declines
 * (returns false → rebuild) when the view rendered no
 * `.rune-block-content` — there is nothing to write the width to.
 *
 * Empty-state views absorb the change as a NO-OP instead: their render
 * path never applies `contentWidth` (Image and the source-media factory
 * both skip `applyContentWidthAttrs` on the empty branch), so writing the
 * width onto the placeholder would diverge from what a rebuild renders —
 * while declining would rebuild into byte-identical DOM and needlessly
 * unmount portaled chrome.
 */
export const contentWidthInPlaceAttr: RuneInPlaceAttr = {
  attr: "contentWidth",
  applyToDOM: ({ root, content }, value) => {
    if (!content) return false
    // Empty-state markers: Image's `rune-image-empty` (Image/block.ts),
    // the source-media factory's `rune-media-empty` (render.ts).
    if (
      root.classList.contains("rune-image-empty") ||
      root.classList.contains("rune-media-empty")
    ) {
      return
    }
    const width = normalizeContentWidth(value)
    if (width !== null) {
      content.style.width = `${width}%`
      content.setAttribute("data-rune-resized", "")
    } else {
      content.style.width = ""
      content.removeAttribute("data-rune-resized")
    }
  },
}

function mergeInlineStyle(existing: string | undefined, addition: string): string {
  return existing && existing.trim().length > 0
    ? `${existing.trim().replace(/;?$/, ";")} ${addition}`
    : addition
}

function widthFromStyleAttr(style: string | null): string {
  const match = style?.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i)
  return match?.[1]?.trim() ?? ""
}
