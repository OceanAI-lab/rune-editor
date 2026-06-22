// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Column boundary resize (Task 7).
//
// Gesture ownership rules (the CellHandleDrag protocol, see its header):
//  1. Mousedown does NOT claim the gesture; refuse-at-entry if activeGesture
//     is already non-null.
//  2. Horizontal pointer movement >= COLUMN_RESIZE_THRESHOLD_PX from
//     mousedown promotes to column-resize (claim the central gestureKey
//     registry, register cancel handlers, snapshot the pair's inline styles).
//  3. Cleanup releases via `claim.release()` (shared protocol — race-safe,
//     never stomps another gesture's claim; idempotent).
//  4. Below-threshold mouseup → no-op (a boundary handle has no click
//     semantics).
//
// The handles are PM WIDGET DECORATIONS placed at each adjacent column
// boundary inside the layout node (CLAUDE.md invariant 6 — no JS-positioned
// overlays; alignment comes from the flex layout, never from scroll-tracking
// JS). The widget parent (`columnLayout`, content "column{2,5}") is NOT a
// textblock, so PM's addTextblockHacks separator-img hack
// (project_pm_widget_textblock_hack) cannot trigger — `raw: true` is
// intentionally not needed here.
//
// Width model (locked decision E3): `width` is a RATIO (flex-grow
// proportion). Dragging a boundary redistributes ONLY the two adjacent
// columns' ratios; their sum is conserved, so every other column's pixel
// share is untouched. The pixel→ratio math is fresh (the percent-of-
// container helpers in extensions/resize/geometry.ts do not transfer to a
// pairwise-ratio model): both columns of a pair share the same px-per-
// ratio-unit, so the boundary's pixel fraction of the PAIR maps linearly
// onto the pair's ratio sum.
//
// Live preview writes `--rune-col-width` inline on the two column DOM nodes
// (the same custom property the attrs render — flex CSS picks it up with no
// re-render). These writes are SANCTIONED by the `column` NodeView's
// ignoreMutation (nodes.ts): without it, PM's DOMObserver treats the first
// style write as a foreign mutation and redraws the layout subtree mid-drag
// (real browsers only). Belt-and-braces, the gesture also re-resolves the
// pair's elements per mousemove (refreshPairEls) so any OTHER mid-drag
// redraw can never strand the preview on detached nodes. Commit on mouseup
// is ONE transaction setting both `width` attrs with addToHistory left
// TRUE: a resize is a user edit, not internal normalization — deliberately
// NOT tagged INTERNAL_NORMALIZATION_META.
import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { EditorView } from "@tiptap/pm/view"
import {
  gestureKey,
  claimGesture,
  isPrimaryRelease,
  primaryLost,
  type GestureClaim,
} from "../../extensions/shared/gesture-state"
import { registerDragCancelHandlers } from "../../extensions/shared/drag-utils"
import { normalizeColumnWidth } from "./normalization"

/** Pointer must travel this many horizontal px before the gesture claims. */
export const COLUMN_RESIZE_THRESHOLD_PX = 4

/** Ratio floor for either column of the dragged pair, as a fraction of the
 *  pair's combined ratio. 0.2 ⇒ a column can shrink to 20% of the pair —
 *  small enough for strong asymmetry, large enough that a column never
 *  visually collapses or becomes ungrabbable. */
export const MIN_COLUMN_PAIR_FRACTION = 0.2

/** Ratios are rounded to this many decimals on commit so persisted attrs
 *  stay readable (`1.2`, not `1.2000000000000002`). Exported so other
 *  width-writing code paths (wrapIntoColumns' mean-width rule) commit the
 *  same precision. */
export const RATIO_DECIMALS = 4

const HANDLE_CLASS = "rune-col-resize-handle"
const HANDLE_SELECTOR = `.${HANDLE_CLASS}`

export interface ColumnPairResizeInput {
  /** Current ratio of the column left of the boundary. */
  leftRatio: number
  /** Current ratio of the column right of the boundary. */
  rightRatio: number
  /** Rendered pixel width of the left column at drag start. */
  leftPx: number
  /** Rendered pixel width of the right column at drag start. */
  rightPx: number
  /** Horizontal pointer travel since drag start (+ = boundary moves right). */
  deltaPx: number
}

/**
 * Pure pixel→ratio redistribution for one adjacent column pair.
 *
 * Both columns share the same px-per-ratio-unit (they're flex items of one
 * container), so the boundary's pixel position as a fraction of the PAIR's
 * total pixels maps linearly onto the pair's ratio sum. The fraction is
 * clamped to [MIN_COLUMN_PAIR_FRACTION, 1 − MIN_COLUMN_PAIR_FRACTION] so
 * neither column collapses. The pair's ratio sum is conserved: `right` is
 * `sum − left`, rounded to the same RATIO_DECIMALS precision so commits
 * persist clean values (for ≤4-decimal inputs — i.e. anything this module
 * ever commits — the compensating subtraction keeps the sum exact).
 *
 * Degenerate input (non-finite anything, non-positive pixel or ratio sum)
 * returns the input ratios unchanged.
 */
export function resizeColumnPair(input: ColumnPairResizeInput): {
  left: number
  right: number
} {
  const { leftRatio, rightRatio, leftPx, rightPx, deltaPx } = input
  const unchanged = { left: leftRatio, right: rightRatio }
  const ratioSum = leftRatio + rightRatio
  const pxSum = leftPx + rightPx
  if (
    !Number.isFinite(ratioSum) ||
    !Number.isFinite(pxSum) ||
    !Number.isFinite(deltaPx) ||
    ratioSum <= 0 ||
    pxSum <= 0
  ) {
    return unchanged
  }
  const fraction = Math.min(
    1 - MIN_COLUMN_PAIR_FRACTION,
    Math.max(MIN_COLUMN_PAIR_FRACTION, (leftPx + deltaPx) / pxSum),
  )
  const factor = 10 ** RATIO_DECIMALS
  const left = Math.round(fraction * ratioSum * factor) / factor
  const right = Math.round((ratioSum - left) * factor) / factor
  return { left, right }
}

/**
 * Pure: content-local offsets of each adjacent-column boundary inside a
 * `columnLayout` node — one entry per pair (N columns → N−1 boundaries).
 * The widget decoration position for boundary `k` is `layoutPos + 1 +
 * offsets[k]`.
 */
export function columnBoundaryOffsets(layout: ProseMirrorNode): number[] {
  const offsets: number[] = []
  let acc = 0
  for (let i = 0; i < layout.childCount - 1; i++) {
    acc += layout.child(i).nodeSize
    offsets.push(acc)
  }
  return offsets
}

// ---------------------------------------------------------------------------
// Decorations — boundary handles + gesture-suppression marker
// ---------------------------------------------------------------------------

function buildHandle(view: EditorView, boundary: number): HTMLElement {
  const el = view.dom.ownerDocument.createElement("div")
  el.className = HANDLE_CLASS
  el.dataset.runeColBoundary = String(boundary)
  // Semantically a draggable divider between two panes.
  el.setAttribute("role", "separator")
  el.setAttribute("aria-orientation", "vertical")
  return el
}

function buildDecorations(
  state: EditorState,
  suppressed: boolean,
): DecorationSet | null {
  const decos: Decoration[] = []
  // columnLayout is non-indentable and nesting is forbidden (v1), so layouts
  // only ever sit at root — a root-children walk is sufficient and cheaper
  // than doc.descendants.
  state.doc.forEach((node, pos) => {
    if (node.type.name !== "columnLayout") return
    if (suppressed) {
      // Core-side gesture gating (no CSS !important): while a FOREIGN
      // gesture owns the registry — or the editor is read-only — mark the
      // layout so plain CSS can kill the handles' hover reveal and
      // pointer-events. The widget keys below stay stable, so flipping
      // this marker never rebuilds the handle DOM.
      decos.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-rune-cols-suppressed": "",
        }),
      )
    }
    const layoutId = typeof node.attrs.id === "string" ? node.attrs.id : String(pos)
    columnBoundaryOffsets(node).forEach((offset, k) => {
      decos.push(
        Decoration.widget(pos + 1 + offset, (view) => buildHandle(view, k), {
          side: -1,
          ignoreSelection: true,
          // Stable in (layout identity, boundary index): PM reuses the
          // handle DOM across recomputes, including mid-drag gestureKey
          // transactions (keeps data-rune-resize-active alive).
          key: `rune-col-resize:${layoutId}:${k}`,
        }),
      )
    })
  })
  return decos.length > 0 ? DecorationSet.create(state.doc, decos) : null
}

// ---------------------------------------------------------------------------
// Gesture — boundary drag
// ---------------------------------------------------------------------------

interface PairContext {
  /** Stable layout identity for the position-fresh commit lookup. */
  layoutId: string | null
  /** Layout pos captured at mousedown — fallback when id is unfilled. */
  layoutPos: number
  boundary: number
  /** CURRENT handle / column elements. Re-resolved per mousemove (see
   *  refreshPairEls) — a PM redraw mid-drag (collab tr, normalization, …)
   *  recreates the layout subtree and detaches cached elements; caching
   *  once at mousedown would strand the preview on dead nodes. */
  handle: HTMLElement
  leftEl: HTMLElement
  rightEl: HTMLElement
  leftRatio: number
  rightRatio: number
  leftPx: number
  rightPx: number
  downX: number
  /** Inline cssText of the pair at claim time, restored on cancel and
   *  before the commit dispatch (PM's attr-driven style then stands). */
  prevLeftCss: string
  prevRightCss: string
  lastLeft: number
  lastRight: number
}

/** Position-fresh lookup of the dragged pair at commit time (resilient to
 *  intervening doc edits, mirroring CellHandleDrag's moveSlice contract). */
function findPairPositions(
  doc: ProseMirrorNode,
  layoutId: string | null,
  fallbackPos: number,
  boundary: number,
): { leftPos: number; rightPos: number } | null {
  let layoutPos = -1
  doc.forEach((node, pos) => {
    if (layoutPos >= 0 || node.type.name !== "columnLayout") return
    const id = typeof node.attrs.id === "string" ? node.attrs.id : null
    if (layoutId != null ? id === layoutId : pos === fallbackPos) layoutPos = pos
  })
  if (layoutPos < 0) return null
  const layout = doc.nodeAt(layoutPos)
  if (!layout || boundary + 1 >= layout.childCount) return null
  let offset = 0
  for (let i = 0; i < boundary; i++) offset += layout.child(i).nodeSize
  const leftPos = layoutPos + 1 + offset
  const rightPos = leftPos + layout.child(boundary).nodeSize
  return { leftPos, rightPos }
}

function setupColumnResize(view: EditorView): { destroy(): void } {
  const ownerDoc = view.dom.ownerDocument

  let pair: PairContext | null = null
  let claim: GestureClaim | null = null
  let cancelCleanup: (() => void) | null = null

  /** Position-fresh re-resolution of the dragged pair's DOM (and the active
   *  handle widget) from the live view. Cheap — one root-children walk +
   *  two nodeDOM lookups. When an element's identity changed (PM redrew the
   *  subtree), its inline-style snapshot is retaken BEFORE the next preview
   *  write, so cancel/commit restores the correct baseline (a recreated
   *  element renders pure attr-driven styles). Returns false when the pair
   *  can no longer be resolved (layout deleted mid-drag). */
  const refreshPairEls = (): boolean => {
    if (!pair) return false
    const found = findPairPositions(
      view.state.doc,
      pair.layoutId,
      pair.layoutPos,
      pair.boundary,
    )
    if (!found) return false
    const leftEl = view.nodeDOM(found.leftPos)
    const rightEl = view.nodeDOM(found.rightPos)
    if (!(leftEl instanceof HTMLElement) || !(rightEl instanceof HTMLElement)) {
      return false
    }
    if (leftEl !== pair.leftEl) {
      pair.leftEl = leftEl
      pair.prevLeftCss = leftEl.style.cssText
    }
    if (rightEl !== pair.rightEl) {
      pair.rightEl = rightEl
      pair.prevRightCss = rightEl.style.cssText
    }
    if (!pair.handle.isConnected) {
      const fresh = leftEl.parentElement?.querySelector<HTMLElement>(
        `${HANDLE_SELECTOR}[data-rune-col-boundary="${pair.boundary}"]`,
      )
      if (fresh) {
        pair.handle = fresh
        if (claim) fresh.setAttribute("data-rune-resize-active", "")
      }
    }
    return true
  }

  const writePreview = (left: number, right: number) => {
    if (!pair || !refreshPairEls()) return
    pair.leftEl.style.setProperty("--rune-col-width", String(left))
    pair.rightEl.style.setProperty("--rune-col-width", String(right))
    pair.lastLeft = left
    pair.lastRight = right
  }

  const restorePreview = () => {
    if (!pair) return
    pair.leftEl.style.cssText = pair.prevLeftCss
    pair.rightEl.style.cssText = pair.prevRightCss
  }

  // Shared terminal teardown. Delegates registry release to claim.release()
  // (race-safe, idempotent, destroyed-view-safe — shared protocol).
  const finalizeAndClear = () => {
    claim?.release()
    claim = null
    pair?.handle.removeAttribute("data-rune-resize-active")
    cancelCleanup?.()
    cancelCleanup = null
    ownerDoc.removeEventListener("mousemove", onMouseMove)
    ownerDoc.removeEventListener("mouseup", onMouseUp)
    pair = null
  }

  // Promote the armed-but-sub-threshold state to an active claim.
  // Returns true on success; on refusal (null from claimGesture, GS-6)
  // runs full armed-state cleanup so no listeners survive.
  const promoteGesture = (): boolean => {
    if (!pair) return false
    // claimGesture refuses if another gesture grabbed the registry during
    // the sub-threshold window, or if the view was destroyed.
    const acquired = claimGesture(view, "column-resize")
    if (!acquired) {
      // GS-6: refusal = full cleanup of armed state (no listeners survive).
      finalizeAndClear()
      return false
    }
    claim = acquired
    // The sub-threshold window may have seen a redraw — re-resolve the
    // pair before snapshotting so the snapshot targets live elements.
    refreshPairEls()
    // Snapshot the pair's inline styles NOW (cssText, not just the one
    // property — robust restore even if other inline state exists).
    pair.prevLeftCss = pair.leftEl.style.cssText
    pair.prevRightCss = pair.rightEl.style.cssText
    // Keep the boundary bar visible for the whole drag even when the
    // pointer leaves the layout's hover zone (CSS keys on this attr).
    pair.handle.setAttribute("data-rune-resize-active", "")
    // Escape / pointercancel / window blur all cancel: restore the
    // pre-drag preview, release the registry, unhook. (The original
    // resize/gesture.ts omitted this registration — review finding;
    // do not copy that.)
    cancelCleanup = registerDragCancelHandlers(() => {
      restorePreview()
      finalizeAndClear()
    })
    return true
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!pair) return
    // Lost-mouseup defense: if the primary button is no longer down, the
    // mouseup happened where we couldn't see it (alt-tab, OS dialog, browser
    // chrome). Cancel instead of resizing on a button-less move — same
    // semantics as Escape/blur: restore the pre-drag preview, never commit.
    // (Mirrors extensions/resize/gesture.ts.) Before the claim there is no
    // preview to restore (the cssText snapshot is taken at claim time), so
    // only tear down the armed state.
    if (primaryLost(e)) {
      if (claim) restorePreview()
      finalizeAndClear()
      return
    }
    if (!claim) {
      if (Math.abs(e.clientX - pair.downX) >= COLUMN_RESIZE_THRESHOLD_PX) promoteGesture()
      if (!claim) return
    }
    // NO removeAllRanges here (unlike block-drag / CellHandleDrag): the
    // handle's mousedown is preventDefault-ed by handleDOMEvents, so the
    // browser never opens a selection-extension session — there is nothing
    // to sweep. Clearing ranges anyway EMPTIES the user's pre-drag caret,
    // and PM's DOMObserver flush then falls back to Selection.atStart —
    // the caret visibly teleports to the first block mid-drag.
    e.preventDefault()
    const next = resizeColumnPair({
      leftRatio: pair.leftRatio,
      rightRatio: pair.rightRatio,
      leftPx: pair.leftPx,
      rightPx: pair.rightPx,
      deltaPx: e.clientX - pair.downX,
    })
    writePreview(next.left, next.right)
  }

  const onMouseUp = (e: MouseEvent) => {
    if (!pair) return
    // Only the primary release ends the gesture — a right/middle release
    // mid-drag must not commit (mirrors the mousedown gate below and
    // extensions/resize/gesture.ts's onMouseUp).
    if (!isPrimaryRelease(e)) return
    if (!claim) {
      // Below threshold — never claimed, nothing to restore or commit.
      // Do NOT touch gestureKey (rule 4).
      finalizeAndClear()
      return
    }
    const ctx = pair
    // AV-2: editable may have flipped mid-gesture; abort without committing.
    if (!claim.canCommit) {
      restorePreview()
      finalizeAndClear()
      return
    }
    // Restore the pre-drag inline styles BEFORE the commit dispatch: PM
    // applies the new width attrs synchronously inside dispatch, so no
    // intermediate frame paints, and the attr-rendered style becomes the
    // single source of truth again (no stale inline override to fight a
    // later external width change).
    restorePreview()
    finalizeAndClear()
    // No-op guard: compare against the ROUNDED stored ratios. `lastLeft` is
    // always RATIO_DECIMALS-rounded by resizeColumnPair, but a stored attr
    // can carry more decimals (external/collab writer) — raw strict equality
    // would then commit a spurious rounding-only tr on a zero-delta drag.
    const noopFactor = 10 ** RATIO_DECIMALS
    const storedLeft = Math.round(ctx.leftRatio * noopFactor) / noopFactor
    const storedRight = Math.round(ctx.rightRatio * noopFactor) / noopFactor
    if (ctx.lastLeft === storedLeft && ctx.lastRight === storedRight) return
    const found = findPairPositions(view.state.doc, ctx.layoutId, ctx.layoutPos, ctx.boundary)
    if (!found) return
    // ONE transaction, BOTH widths, addToHistory left true — a user edit,
    // not normalization (no INTERNAL_NORMALIZATION_META).
    const tr = view.state.tr
      .setNodeAttribute(found.leftPos, "width", ctx.lastLeft)
      .setNodeAttribute(found.rightPos, "width", ctx.lastRight)
    try {
      view.dispatch(tr)
    } catch { /* destroyed */ }
  }

  const onMouseDown = (e: MouseEvent) => {
    if (!view.editable) return
    if (e.button !== 0) return
    const target = e.target
    if (!(target instanceof Element)) return
    const handle = target.closest<HTMLElement>(HANDLE_SELECTOR)
    if (!handle || !view.dom.contains(handle)) return
    // Refuse-at-entry (rule 1): if another gesture owns the central
    // registry, this mousedown is not ours to arm.
    if (gestureKey.getState(view.state)?.activeGesture != null) return
    // Re-entry guard: a stray second mousedown while armed must not
    // clobber the in-flight gesture or stack duplicate listeners.
    if (pair) return

    const layoutEl = handle.closest<HTMLElement>("[data-rune-columns]")
    if (!layoutEl) return
    const boundary = Number(handle.dataset.runeColBoundary)
    if (!Number.isInteger(boundary) || boundary < 0) return

    // Resolve the layout node from the DOM (position-fresh, no cached pos).
    let layoutPos: number
    try {
      const inside = view.posAtDOM(layoutEl, 0)
      layoutPos = inside - 1
    } catch {
      return
    }
    const layoutNode = view.state.doc.nodeAt(layoutPos)
    if (!layoutNode || layoutNode.type.name !== "columnLayout") return
    if (boundary + 1 >= layoutNode.childCount) return

    // The layout's element children are the column nodes plus our handle
    // widgets — filter to the columns to pair DOM with node indices.
    const columnEls = Array.from(layoutEl.children).filter((el): el is HTMLElement =>
      el instanceof HTMLElement && el.hasAttribute("data-rune-column"),
    )
    const leftEl = columnEls[boundary]
    const rightEl = columnEls[boundary + 1]
    if (!leftEl || !rightEl) return

    pair = {
      layoutId:
        typeof layoutNode.attrs.id === "string" ? layoutNode.attrs.id : null,
      layoutPos,
      boundary,
      handle,
      leftEl,
      rightEl,
      leftRatio: normalizeColumnWidth(layoutNode.child(boundary).attrs.width),
      rightRatio: normalizeColumnWidth(layoutNode.child(boundary + 1).attrs.width),
      leftPx: leftEl.getBoundingClientRect().width,
      rightPx: rightEl.getBoundingClientRect().width,
      downX: e.clientX,
      prevLeftCss: "",
      prevRightCss: "",
      lastLeft: normalizeColumnWidth(layoutNode.child(boundary).attrs.width),
      lastRight: normalizeColumnWidth(layoutNode.child(boundary + 1).attrs.width),
    }
    claim = null
    ownerDoc.addEventListener("mousemove", onMouseMove)
    ownerDoc.addEventListener("mouseup", onMouseUp)
  }

  view.dom.addEventListener("mousedown", onMouseDown)

  return {
    destroy() {
      view.dom.removeEventListener("mousedown", onMouseDown)
      if (claim) restorePreview()
      finalizeAndClear()
    },
  }
}

/**
 * Boundary-drag column resize, shipped through `columnLayout`'s
 * `extensions: [...]` array (zero kit.ts special-casing).
 */
export const ColumnsResize = Extension.create({
  name: "columnsResize",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("rune-columns-resize"),
        props: {
          decorations(state) {
            const gesture = gestureKey.getState(state)?.activeGesture ?? null
            const suppressed =
              (gesture != null && gesture !== "column-resize") || !editor.isEditable
            return buildDecorations(state, suppressed)
          },
          // Handle press must suppress BOTH layers of mousedown handling:
          // returning `true` only skips PM's own handler (prosemirror-view's
          // runCustomHandler never calls preventDefault for you), while the
          // BROWSER default — caret placement + a native selection-extension
          // session — keeps running. Left alive, that session re-places the
          // caret at the nearest text position on every drag mousemove,
          // visibly ping-ponging it across the boundary's two columns. So:
          // preventDefault here (kills the native session at its root, the
          // only place that works) AND return true (keeps PM out of it).
          handleDOMEvents: {
            mousedown(_view, event) {
              const target = event.target as HTMLElement | null
              if (!target?.closest(HANDLE_SELECTOR)) return false
              event.preventDefault()
              return true
            },
          },
        },
        view(view) {
          return setupColumnResize(view)
        },
      }),
    ]
  },
})
