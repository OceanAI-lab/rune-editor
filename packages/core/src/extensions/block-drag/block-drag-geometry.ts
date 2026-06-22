// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { BlockGeom, BlocksSnapshot } from "./types"
import { isDraggable } from "../side-menu/block-registry"
import { getEditorVar, resolveCssLengthToPx } from "../shared"
import { surfaceChildrenAt } from "../../schema/bodySurface"

const INDENT_STEP_VAR = "--rune-block-indent-step"
const FALLBACK_INDENT_STEP = "1.875rem"

/** Sentinel `surfacePos` for the document root surface. */
const ROOT_SURFACE = -1

/**
 * Snapshot every draggable top-level block. Thin root-surface adapter over
 * `surfaceBlockSnapshot` — kept as the existing call sites' entry point and
 * behavior-identical to the pre-Phase-2 single-layer `doc.forEach` walk.
 */
export function snapshotBlocks(view: EditorView, editor: Editor): BlocksSnapshot {
  return surfaceBlockSnapshot(view, ROOT_SURFACE, editor)
}

/**
 * Snapshot the draggable blocks of ONE body surface, in document order.
 *
 * `surfacePos === -1` (the `ROOT_SURFACE` sentinel) snapshots the doc root —
 * byte-identical to the legacy `snapshotBlocks` (single-layer `doc.forEach`,
 * no descendants descent). Any other value is a `column` node's absolute PM
 * pos; its first-class body-block children are snapshotted on their own flat
 * surface, and `minLeft`/`maxRight` accumulate over THOSE blocks only — so the
 * drop indicator spans the column's content width, not the page.
 *
 * Same `BlockGeom` shape, same `isDraggable` filtering, same `indicatorLeftFor`
 * / indentStep resolution as the root path — only the surface iterated differs.
 */
export function surfaceBlockSnapshot(
  view: EditorView,
  surfacePos: number,
  editor: Editor,
): BlocksSnapshot {
  const blocks: BlockGeom[] = []
  let minLeft = Infinity
  let maxRight = -Infinity
  const editorRoot = view.dom.closest(".rune-editor") as HTMLElement | null
  const indentStepPx = editorRoot
    ? resolveCssLengthToPx(getEditorVar(editorRoot, INDENT_STEP_VAR, FALLBACK_INDENT_STEP), editorRoot)
    : resolveCssLengthToPx(FALLBACK_INDENT_STEP, view.dom)

  // Resolve the surface's node + the absolute pos of its first child. For the
  // root that is the doc itself (first child at pos 0); for a column we resolve
  // through `surfaceChildrenAt`, which returns the surface a boundary pos sits
  // on — `surfacePos + 1` is a boundary just inside the column node.
  let surfaceNode: ProseMirrorNode
  let childStart: number
  if (surfacePos === ROOT_SURFACE) {
    surfaceNode = view.state.doc
    childStart = 0
  } else {
    const surface = surfaceChildrenAt(view.state.doc, surfacePos + 1)
    if (!surface || surface.pos !== surfacePos) {
      return { blocks, minLeft, maxRight, indentStepPx }
    }
    surfaceNode = surface.node
    childStart = surface.start
  }

  let childPos = childStart
  surfaceNode.forEach((node) => {
    const pos = childPos
    childPos += node.nodeSize
    if (!isDraggable(node.type.name, editor)) return
    const dom = view.nodeDOM(pos) as HTMLElement | null
    if (!dom) return
    const rect = dom.getBoundingClientRect()
    const indicatorLeft = indicatorLeftFor(dom, rect)
    const cs = getComputedStyle(dom)
    blocks.push({
      pos,
      nodeSize: node.nodeSize,
      type: node.type.name,
      depth: typeof node.attrs.depth === "number" ? node.attrs.depth : 0,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      indicatorLeft,
      width: rect.width,
      marginTop: parseFloat(cs.marginTop) || 0,
      marginBottom: parseFloat(cs.marginBottom) || 0,
    })
    if (rect.left < minLeft) minLeft = rect.left
    if (rect.right > maxRight) maxRight = rect.right
  })

  return { blocks, minLeft, maxRight, indentStepPx }
}

/**
 * Mutate the snapshot in place to reflect each block's CURRENT viewport rect.
 *
 * Called from the block-drag capture-scroll listener. After this returns, every
 * block's `top`/`bottom`/`left`/`width` and the snapshot's `minLeft`/`maxRight`
 * are in the live viewport frame — no scroll-delta correction needed at the
 * call site.
 *
 * If a block's DOM is no longer resolvable via `view.nodeDOM(pos)` (rare:
 * a transaction removed it mid-drag), its entry is left as-is. Drag is gestural
 * and short-lived; we don't rebuild the index.
 */
export function refreshSnapshotRects(view: EditorView, snapshot: BlocksSnapshot): void {
  let minLeft = Infinity
  let maxRight = -Infinity
  for (const b of snapshot.blocks) {
    const dom = view.nodeDOM(b.pos) as HTMLElement | null
    if (!dom) {
      // Stale entry — keep its old rect contributing to min/max so the
      // indicator band doesn't visibly jump.
      if (b.left < minLeft) minLeft = b.left
      if (b.left + b.width > maxRight) maxRight = b.left + b.width
      continue
    }
    const rect = dom.getBoundingClientRect()
    b.top = rect.top
    b.bottom = rect.bottom
    b.left = rect.left
    b.indicatorLeft = indicatorLeftFor(dom, rect)
    b.width = rect.width
    if (rect.left < minLeft) minLeft = rect.left
    if (rect.right > maxRight) maxRight = rect.right
  }
  snapshot.minLeft = minLeft
  snapshot.maxRight = maxRight
}

function indicatorLeftFor(blockDom: HTMLElement, blockRect: DOMRect): number {
  const content = blockDom.querySelector<HTMLElement>(":scope > .rune-block-content")
  return content?.getBoundingClientRect().left ?? blockRect.left
}

/**
 * Slot index at cursor Y. Returns [0, blocks.length]; slot k sits
 * between blocks[k-1] and blocks[k]. Boundary = each block's vertical
 * centre (top + bottom) / 2. Boundary exclusive: cursor AT centre
 * resolves to slot below.
 *
 * Source-aware: cursor inside source's Y range resolves to fromRange.lo
 * upper / falls through fromRange.hi lower. Single-block source is
 * fromRange = { lo: idx, hi: idx } and behaves identically to a single
 * fromIdx — preserves existing behavior bit-for-bit.
 */
export function slotAtY(
  blocks: BlockGeom[],
  clientY: number,
  fromRange: { lo: number; hi: number },
): number {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    const center = (b.top + b.bottom) / 2
    if (i >= fromRange.lo && i <= fromRange.hi) {
      // Inside the source band:
      //   - above lo's center → return lo (cursor wants to drop above the band)
      //   - else continue past the band (eventually fall through past hi)
      if (i === fromRange.lo && clientY < center) return fromRange.lo
      continue
    }
    if (clientY < center) return i
  }
  return blocks.length
}

/**
 * Resolve the previous block index used for drop-depth bounds.
 *
 * At the slot just below the source band, `targetIdx - 1` is the source itself.
 * For in-place depth changes the source should not be its own depth anchor, so
 * use the block before the band instead.
 */
export function effectivePrevIndex(
  targetIdx: number,
  fromRange: { lo: number; hi: number },
): number {
  if (targetIdx === fromRange.hi + 1) return fromRange.lo - 1
  return targetIdx - 1
}
