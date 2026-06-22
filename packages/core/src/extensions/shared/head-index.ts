// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { surfaceChildrenAt } from "../../schema/bodySurface"
import type { SurfaceRef } from "./surface-from-point"

/** Sentinel `surfacePos` for the document root surface. */
const ROOT_SURFACE = -1

/**
 * Resolve the body-block index under the pointer at (clientX, clientY),
 * WITHIN a given surface.
 *
 * Default (`surface` omitted or its `surfacePos === -1`): the ROOT surface —
 * byte-identical to the pre-Phase-2 behavior. When `surface` names a `column`
 * (its absolute pos), the returned index is among THAT column's children, the
 * `$pos.index(d)` read is taken at the column's depth, the `doc.childCount`
 * clamp becomes the column's child count, and the rect fallback walks the
 * column's children. The two paths share one body so root behavior cannot drift
 * (characterization: head-index.test.ts stays green unmodified).
 *
 * Default: out-of-range Y clamps to first/last (used by in-flight drag tracking
 * so dragging past either edge keeps extending toward the nearest block).
 *
 * `strict: true`: out-of-range Y returns `null` (used by mousedown handlers
 * so a click in the void below the last block triggers nothing).
 *
 * Fast-path clamp via `Math.min` is unconditional — `posAtCoords` can resolve
 * to `doc.content.size` (one past the last block) when the cursor sits at the
 * very end, and callers using the index to read `doc.child(index)` would crash.
 *
 * Strict mode rejects only that void-below-last-block resolution (where
 * `posAtCoords` resolves a click in the editor's bottom padding to
 * `doc.content.size`) so the "click in the void below the last block triggers
 * nothing" contract is honored. Other fast-path resolutions inside the doc
 * keep their clamp semantics.
 *
 * Atom inside-preference: when `hit.inside` names an atom belonging to the
 * requested surface, the index is read from the atom itself, beating both the
 * caret-bias of `hit.pos` and the strict void rejection (rationale at the
 * body comment in the fast path).
 *
 * Returns null only if the surface is empty, OR if `strict` and cursor is
 * outside every block rect.
 */
export function headIndexAtY(
  view: EditorView,
  clientX: number,
  clientY: number,
  options: { strict?: boolean; surface?: SurfaceRef } = {},
): number | null {
  const surfacePos = options.surface?.surfacePos ?? ROOT_SURFACE

  // Resolve the surface node, the depth its children sit at (for the
  // posAtCoords index read), the absolute pos of its first child, and its
  // child count. Root: the doc itself, depth 0, first child at pos 0.
  let surfaceNode: ProseMirrorNode
  let surfaceDepth: number
  let childStart: number
  if (surfacePos === ROOT_SURFACE) {
    surfaceNode = view.state.doc
    surfaceDepth = 0
    childStart = 0
  } else {
    const surface = surfaceChildrenAt(view.state.doc, surfacePos + 1)
    if (!surface || surface.pos !== surfacePos) return null
    surfaceNode = surface.node
    childStart = surface.start
    // Depth of the surface's children = depth of the surface node + 1.
    surfaceDepth = view.state.doc.resolve(childStart).depth
  }
  const childCount = surfaceNode.childCount
  if (childCount === 0) return null

  // The surface's end boundary — the strict "void below last block" guard for
  // the root is `doc.content.size`; for a column it is the pos just after its
  // last child (one before the column's closing token).
  const surfaceEnd =
    surfacePos === ROOT_SURFACE
      ? view.state.doc.content.size
      : childStart + surfaceNode.content.size

  const hit = view.posAtCoords({ left: clientX, top: clientY })

  // ATOM caret-bias correction. `hit.pos` over an atom leaf (image/video/
  // divider) is a CARET position — the atom's right half resolves to the
  // boundary AFTER it, so the `$pos.index` read below would name the NEXT
  // block. `hit.inside` names the node the point is physically within; when
  // that node is an atom belonging to the requested surface (same confinement
  // rule as the caret path below), read the index from the inside pos instead.
  // This also takes precedence over the strict void-below-last rejection: a
  // right-half hit on a LAST-child atom resolves `pos` past `surfaceEnd`, but
  // the pointer is ON the atom, not in the void.
  //
  // Deliberately NO `isDraggable` gate, unlike SideMenu.ts's sibling
  // correction (whose result becomes a grip/menu target, so it must name a
  // draggable): this index answers "which block row is under Y", and a
  // non-draggable atom still occupies its row. Threading `editor` in here
  // just for that gate would couple the shared resolver to the side-menu
  // registry.
  if (hit && hit.inside >= 0) {
    // `hit.inside` points directly before the inside node, so
    // `$inside.nodeAfter` IS that node — one (cached) resolve instead of
    // an uncached `nodeAt` walk plus a second resolve on atom hits.
    const $inside = view.state.doc.resolve(hit.inside)
    if ($inside.nodeAfter?.isAtom) {
      const insideConfined =
        surfacePos === ROOT_SURFACE
          ? $inside.depth >= surfaceDepth
          : $inside.depth >= surfaceDepth &&
            $inside.before(surfaceDepth) === surfacePos
      if (insideConfined) {
        return Math.min($inside.index(surfaceDepth), childCount - 1)
      }
    }
  }

  if (hit && !(options.strict && hit.pos >= surfaceEnd)) {
    const $pos = view.state.doc.resolve(hit.pos)
    // Read the index at the surface's child depth so a deep hit inside a column
    // child resolves to that child's index within the column.
    //
    // The fast path must be CONFINED to the requested surface. `posAtCoords`
    // snaps to the nearest editable text, which — at a thin inter-column gap —
    // can land inside a SIBLING column (the very gap ambiguity surfaceFromPoint
    // sidesteps with rect hit-testing). A bare `$pos.depth >= surfaceDepth`
    // would then return the sibling's child index AS THIS surface's index. So
    // for a column surface also require the resolved ancestor at surfaceDepth to
    // BE this column (`$pos.before(surfaceDepth) === surfacePos`); otherwise fall
    // through to the rect walk, which iterates only this surface's children. Root
    // (surfaceDepth 0) has no enclosing node to check and keeps the old `depth>=0`
    // (always-true) behavior, byte-identical to pre-Phase-2.
    const insideSurface =
      surfacePos === ROOT_SURFACE
        ? $pos.depth >= surfaceDepth
        : $pos.depth >= surfaceDepth && $pos.before(surfaceDepth) === surfacePos
    if (insideSurface) {
      return Math.min($pos.index(surfaceDepth), childCount - 1)
    }
  }

  let pos = childStart
  let firstTop = Infinity
  let lastIdx = -1
  for (let i = 0; i < childCount; i++) {
    const dom = view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      const r = dom.getBoundingClientRect()
      if (i === 0) firstTop = r.top
      lastIdx = i
      if (clientY >= r.top && clientY <= r.bottom) return i
    }
    pos += surfaceNode.child(i).nodeSize
  }
  if (options.strict) return null
  if (clientY < firstTop) return 0
  if (lastIdx >= 0) return lastIdx
  return null
}
