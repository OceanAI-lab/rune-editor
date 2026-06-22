// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { isGestureActive } from "../shared"
import { nearestScrollOwner, scrollViewport } from "../shared/scroll-utils"

// CARET_COMFORT_PX: the minimum distance we want to keep between the
// caret and the bottom of the viewport on click. 120 ≈ two block heights
// at our default typography — enough that downward-opening popovers
// (slash menu, color sub-popover, link panel) clear the viewport edge.
// Mirrors v1; not configurable by design (issue #84).
const CARET_COMFORT_PX = 120

export const caretComfortKey = new PluginKey("rune-caret-comfort")

function scrollCaretBottomIntoComfort(view: EditorView, caretBottom: number): void {
  const owner = nearestScrollOwner(view.dom as HTMLElement)
  // Use the *visible* bottom, not the owner's geometric bottom: a tall
  // panel (e.g. `height: 100vh + N`) can extend past the window, in which
  // case owner.bottom overstates how much room the caret has — the
  // popover that opens below it still clips at the window edge. Take
  // min(window.innerHeight, owner.bottom) so the trigger fires whichever
  // edge cuts the caret off first.
  const ownerBottom =
    owner === window
      ? window.innerHeight
      : Math.min(
          window.innerHeight,
          (owner as HTMLElement).getBoundingClientRect().bottom,
        )

  const distanceFromBottom = ownerBottom - caretBottom
  // Comfort is a small *upward* nudge for a caret that's visible but riding
  // the bottom edge — never a chase toward an off-screen caret. When the
  // caret sits below the visible bottom (distanceFromBottom < 0) the click
  // didn't place it there: it's the stale end-of-doc caret the user scrolled
  // away from, and they clicked a non-editable blank region (a wide table's
  // right overflow, the side-menu gutter widget) that doesn't move the
  // selection. Scrolling here would yank the viewport down to that caret.
  // PM's own scrollIntoView already keeps a genuinely placed caret visible,
  // so by comfort time a real near-bottom caret is always >= 0.
  if (distanceFromBottom < 0) return
  if (distanceFromBottom >= CARET_COMFORT_PX) return

  scrollViewport(owner, CARET_COMFORT_PX - distanceFromBottom)
}

function maybeScrollStateSelection(view: EditorView): void {
  if (isGestureActive(view.state)) return
  const { selection } = view.state
  if (!selection.empty) return

  let caretBottom = 0
  try {
    caretBottom = view.coordsAtPos(selection.head).bottom
  } catch {
    return
  }
  if (caretBottom === 0) return

  scrollCaretBottomIntoComfort(view, caretBottom)
}

function scheduleStateSelectionScroll(view: EditorView): void {
  requestAnimationFrame(() => {
    if (view.isDestroyed) return
    maybeScrollStateSelection(view)
  })
}

function shouldCheckStateSelection(state: EditorState, prevState: EditorState): boolean {
  return state.doc !== prevState.doc || !state.selection.eq(prevState.selection)
}

function maybeScrollDomSelection(view: EditorView): void {
  if (isGestureActive(view.state)) return

  // Defer one frame so the browser settles the post-click DOM selection
  // before we measure it. We can't trust view.state.selection here:
  // PM's DOMObserver flushes the selection update on a later tick than
  // our handleDOMEvents.mouseup, so view.state still points at the
  // pre-click selection (e.g. end-of-doc after `commands.focus()`).
  // window.getSelection() is updated synchronously by the browser on
  // mouseup and is the authoritative source for where the caret
  // actually landed.
  requestAnimationFrame(() => {
    if (view.isDestroyed) return

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return

    const range = sel.getRangeAt(0)
    // Ignore clicks outside the editor (browser may report a stale
    // selection inside another contenteditable / input).
    if (!view.dom.contains(range.startContainer)) return

    const rect = range.getBoundingClientRect()
    let caretBottom = rect.bottom
    if (caretBottom === 0) {
      // Real empty blocks render a contenteditable line with no inline content;
      // collapsed Range#getBoundingClientRect returns 0x0 at top:0. Fall back to
      // ProseMirror coords. Derive the doc position from the live DOM Range,
      // not PM's current selection head, to stay consistent with the file's
      // top-level note that view.state.selection lags by one tick post-mouseup.
      try {
        const pos = view.posAtDOM(range.startContainer, range.startOffset)
        caretBottom = view.coordsAtPos(pos).bottom
      } catch {
        return
      }
      if (caretBottom === 0) return
    }

    scrollCaretBottomIntoComfort(view, caretBottom)
  })
}

export const CaretComfort = Extension.create({
  name: "caretComfort",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: caretComfortKey,
        view(view) {
          return {
            update(view, prevState) {
              if (!shouldCheckStateSelection(view.state, prevState)) return
              scheduleStateSelectionScroll(view)
            },
          }
        },
        props: {
          handleDOMEvents: {
            // mouseup is in PM's default-listened event set, so the
            // handler is reliably attached. Returning false lets PM
            // continue normal handling — we are a side-effect observer,
            // not a gate.
            mouseup: (view) => {
              maybeScrollDomSelection(view)
              return false
            },
          },
        },
      }),
    ]
  },
})
