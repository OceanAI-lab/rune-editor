// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"
import { getBlockSpecs } from "../../schema"
import { surfaceChildrenAt } from "../../schema/bodySurface"

/**
 * Is this node type registered as draggable? Flat-schema MVP: a single
 * per-type predicate, no depth / resolved-pos threading.
 */
export function isDraggable(nodeType: string, editor: Editor): boolean {
  return getBlockSpecs(editor)[nodeType]?.sideMenu?.draggable === true
}

/**
 * Walk up from a PM position; deepest draggable ancestor wins.
 * For atom blocks at depth 0 (for example divider), fall back to
 * the adjacent sibling.
 *
 * Columns Phase 2 (F3 — innermost draggable wins): a block INSIDE a `column`
 * gets its OWN grip. The deepest-first walk returns the in-column block when
 * the hit lands inside a column child, and the `columnLayout` when the hit
 * resolves to layout chrome / the inter-column gap (per the Task 4 probe,
 * `posAtCoords` in the gap lands on the columnLayout's own boundary, so the
 * walk's deepest draggable there IS the layout). No name-based suppression —
 * the geometry does the routing.
 */
export function draggableAncestorPosFor(
  view: EditorView,
  pos: number,
  editor: Editor,
): number | null {
  try {
    const $pos = view.state.doc.resolve(pos)
    // F3 atom leg: a draggable ATOM inside a column (divider/image) is never
    // on the boundary hit's ancestor chain — `$pos.parent` is the structural
    // `column`, and the ancestor walk below would settle on the columnLayout
    // (an ancestor OUTSIDE the hit's column), so the atom would never get its
    // own grip. When the hit sits directly on a COLUMN child boundary, consult
    // the adjacent draggable atom FIRST (innermost wins). Restricted to atoms:
    // a non-atom boundary hit (column padding/gap) keeps resolving to the
    // layout, and the ROOT atom path below is untouched (its boundary hits
    // resolve at depth 0, where this guard never fires).
    if ($pos.depth >= 1) {
      const surface = surfaceChildrenAt(view.state.doc, pos)
      if (surface && surface.pos !== -1 && surface.pos === $pos.before($pos.depth)) {
        const after = $pos.nodeAfter
        if (after?.isAtom && isDraggable(after.type.name, editor)) {
          return pos
        }
        const before = $pos.nodeBefore
        if (before?.isAtom && isDraggable(before.type.name, editor)) {
          return pos - before.nodeSize
        }
      }
    }
    for (let d = $pos.depth; d >= 1; d--) {
      const node = $pos.node(d)
      if (!isDraggable(node.type.name, editor)) continue
      return $pos.before(d)
    }
    if ($pos.nodeAfter && isDraggable($pos.nodeAfter.type.name, editor)) {
      return pos
    }
    if ($pos.nodeBefore && isDraggable($pos.nodeBefore.type.name, editor)) {
      return pos - $pos.nodeBefore.nodeSize
    }
    return null
  } catch {
    return null
  }
}

