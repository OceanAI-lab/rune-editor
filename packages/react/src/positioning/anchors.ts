// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Sessionless anchor getters — the positioning computation lifted out of the
// toolbar / paste-menu inline copies, so any surface (including a downstream
// host's own Popover) can anchor to an editor selection or block with rune's
// exact rect math. See the floating-primitives spec.
//
// These are PURE getters: they read the live DOM via `view` and return a
// `DOMRect | null` (null = couldn't measure, e.g. coordsAtPos threw on an
// invalid pos). The last-good-rect FALLBACK and the React memoization live one
// layer up, in the `useBlockAnchor` / `useSelectionAnchor` hooks — keeping these
// free of React and of any session/component state so they're unit-testable and
// reusable from imperative (non-React) callers too.
//
// The three coordsAtPos shapes are NOT interchangeable (the trap the parity
// tests in anchors.test.ts lock down):
//   * pointAnchorAtHead({height:"zero"})      — point-at-head, zero height
//   * pointAnchorAtHead({height:"selection"}) — InlineToolbar.selectionAnchorRect
//   * rangeToRect                             — useBlockLinkPaste.rectForRange

import type { Editor } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"

/** The editor's DOM node, or undefined when the view isn't mounted yet. Tiptap's
 *  `editor.view` getter THROWS before mount / after destroy, so a plain
 *  `editor?.view.dom` is unsafe to evaluate at render time (e.g. a popover that
 *  mounts a frame before the editor view does). Used to tag anchors with their
 *  `contextElement` for inner-scroll repositioning — see RuneAnchor JSDoc. */
export function editorViewDom(editor: Editor | null): Element | undefined {
  return editor && editor.isInitialized && !editor.isDestroyed
    ? editor.view.dom
    : undefined
}

/** A lazy rect getter: reads the CURRENT visible DOM on every call (so it tracks
 *  scroll/reflow). Returns null when the live read is unavailable. Feed straight
 *  into `useStableVirtualElement`.
 *
 *  `contextElement` is the editor DOM the rect is measured within. floating-ui's
 *  autoUpdate reads it (via the virtual element's `contextElement`) to discover
 *  the rect's REAL scroll ancestors, so the popover re-positions on inner-
 *  container scroll — not just window scroll. Without it autoUpdate only listens
 *  on the floating element's own ancestors (a body-portaled popover → window
 *  only), and the anchor detaches when an inner `overflow:auto` host scrolls.
 *  The producer hooks (`useBlockAnchor` / `useSelectionAnchor`) set this so any
 *  consumer — including a downstream host's own Popover — gets the fix for free.
 */
export interface RuneAnchor {
  (): DOMRect | null
  contextElement?: Element
}

export interface PointAnchorOptions {
  /** Vertical extent of the (zero-WIDTH) point anchor:
   *  - "zero" (default): a true point — the minimal AI selection anchor.
   *  - "selection": spans the selection's height (`max bottom − min top`), so
   *    when a tall popover can't fit above and Radix flips it to side="bottom"
   *    it lands below the text instead of on it. Load-bearing for the toolbar. */
  height?: "zero" | "selection"
}

/** Zero-width point at the selection HEAD's x, the selection's top y. The AI
 *  menu and the inline toolbar both anchor here; they differ only in `height`
 *  (see PointAnchorOptions). x tracks the cursor end the user is looking at
 *  (forward drag → head at `to`; backward drag → head at `from`). */
export function pointAnchorAtHead(
  view: EditorView,
  from: number,
  to: number,
  head: number,
  opts: PointAnchorOptions = {},
): DOMRect | null {
  try {
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)
    const headCoords = view.coordsAtPos(head)
    const top = Math.min(start.top, end.top)
    const height =
      opts.height === "selection" ? Math.max(start.bottom, end.bottom) - top : 0
    return new DOMRect(headCoords.left, top, 0, height)
  } catch {
    return null
  }
}

/** Bounding rect of a text range, anchored at the range START (not the head):
 *  origin = `start.left`/`start.top`, size = bbox out to `end`, with a 1px
 *  minimum on each axis so a degenerate/line-wrapped range never collapses to
 *  zero. The paste-link menu's anchor. */
export function rangeToRect(
  view: EditorView,
  from: number,
  to: number,
): DOMRect | null {
  try {
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)
    return new DOMRect(
      start.left,
      start.top,
      Math.max(end.right - start.left, 1),
      Math.max(end.bottom - start.top, 1),
    )
  } catch {
    return null
  }
}

/** The bounding box of the block element carrying `data-id={blockId}`. CSS.escape
 *  guards ids with characters special to selectors. null when the block isn't in
 *  the DOM (scrolled out / removed). */
export function rectForBlockId(
  view: EditorView,
  blockId: string,
): DOMRect | null {
  const el = view.dom.querySelector(`[data-id="${CSS.escape(blockId)}"]`)
  return el ? el.getBoundingClientRect() : null
}

/** Union bbox over several blocks (min-left/top, max-right/bottom). Ids whose
 *  element isn't in the DOM are dropped; null when none resolve. A single id
 *  degenerates to that block's own rect. The multi-block rewrite preview anchors
 *  the union of its first and last selected blocks. */
export function unionBlockRect(
  view: EditorView,
  blockIds: string[],
): DOMRect | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  let found = false
  for (const id of blockIds) {
    const rect = rectForBlockId(view, id)
    if (!rect) continue
    found = true
    left = Math.min(left, rect.left)
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  if (!found) return null
  return new DOMRect(left, top, right - left, bottom - top)
}
