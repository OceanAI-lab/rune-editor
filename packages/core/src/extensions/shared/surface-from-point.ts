// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorView } from "@tiptap/pm/view"

/** Sentinel `surfacePos` for the document root surface. */
const ROOT_SURFACE = -1

/**
 * A body-block surface identified by the absolute PM pos of its surface node.
 * `surfacePos === -1` ≡ the document root surface; any other value is a
 * `column` node's own pos. Shaped to compose with `surfaceBlockSnapshot`
 * (block-drag-geometry) and `surfaceChildrenAt` (bodySurface), which both key
 * off this same pos.
 */
export interface SurfaceRef {
  /** Absolute PM pos of the surface node, or `-1` for the doc root. */
  surfacePos: number
}

/**
 * Hit-test which body-block surface the point (x, y) sits over: the DEEPEST
 * `column` whose DOM `getBoundingClientRect()` contains the point, else the
 * root surface.
 *
 * DOM-rect based on purpose — NOT `posAtCoords`. A pointer in the inter-column
 * gap or a column's padding resolves ambiguously through `posAtCoords` (it
 * snaps to whichever text run is nearest, crossing the surface boundary); the
 * gesture layer needs the surface the cursor is geometrically OVER, which is a
 * pure rect-containment question. This is the same reason `snapshotBlocks`
 * reads rects rather than positions.
 *
 * Columns are discovered via `[data-rune-column]` (the attr the column NodeView
 * stamps, see blocks/Columns/nodes.ts) and each element is mapped back to its
 * PM pos via `posAtDOM(el, 0) - 1`: `posAtDOM(el, 0)` is the boundary just
 * inside the column (before its first child), so subtracting one yields the
 * column node's own pos — the value `surfaceChildrenAt` / `surfaceBlockSnapshot`
 * expect.
 *
 * "Deepest" is written generically (innermost containing rect wins) so it does
 * not assume the single-level cap. Nested-column-in-column is forbidden in v1,
 * so in practice at most one column ever contains the point.
 */
export function surfaceFromPoint(
  view: EditorView,
  x: number,
  y: number,
): SurfaceRef {
  const columns = view.dom.querySelectorAll<HTMLElement>("[data-rune-column]")
  let bestPos = ROOT_SURFACE
  // Smaller area wins ties — the deepest (innermost) column containing the
  // point. Area is a robust deepest-proxy: a nested column's rect is strictly
  // contained in its ancestor's, so it is always the smaller of the two.
  let bestArea = Infinity
  for (const el of columns) {
    const rect = el.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      continue
    }
    const area = rect.width * rect.height
    if (area > bestArea) continue
    // Map the column DOM element back to its PM pos. posAtDOM(el, 0) is the
    // boundary just inside the column (before its first child); the column
    // node's own pos is one less.
    const pos = view.posAtDOM(el, 0) - 1
    bestPos = pos
    bestArea = area
  }
  return { surfacePos: bestPos }
}
