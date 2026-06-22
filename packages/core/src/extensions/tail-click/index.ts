// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { onEditorWrapperMouseDown } from "../shared"
import { MultiBlockSelection } from "../block-selection/MultiBlockSelection"

export const tailClickKey = new PluginKey("rune-tail-click")

// Click vs drag threshold. Movement past this in either axis between
// mousedown and mouseup tears down the gesture without firing — keeps
// us out of the way of marquee / native text-drag.
const CLICK_THRESHOLD_PX = 4

// What dispatchTailClick appends, and — bound to the same constant —
// what counts as "an empty tail block worth refocusing instead of
// duplicating". Refocus is only correct when the existing tail is the
// same shape as the block we'd otherwise append; an empty Heading or
// Toggle title also satisfies `isTextblock && content.size === 0` but
// is a *different* block type, so refocusing into it makes a tail click
// silently no-op (the caret was already there).
const TAIL_APPEND_TYPE = "paragraph"

/**
 * Notion-style tail-click: clicking the empty area below the last
 * block appends a paragraph and lands the caret in it. Re-clicking the
 * (now empty) tail just refocuses, so the user can never stack more
 * than one extra empty paragraph this way.
 *
 * Listens on `.rune-editor` (not via PM's `handleClick`) so the
 * 30vh scroll-room region — which lives on `.rune-editor`, outside
 * `.ProseMirror` — is a real hit zone. MBS dismissal is owned by the
 * document-level handler in block-selection/plugin.ts; tail-click bails
 * while MBS is active so a tail click only clears the selection.
 */
export const TailClick = Extension.create({
  name: "tailClick",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tailClickKey,
        view(view) {
          let armed: { x: number; y: number } | null = null

          const ownEditor = (): HTMLElement | null => {
            const el = view.dom.closest(".rune-editor")
            return el instanceof HTMLElement ? el : null
          }

          const clear = () => {
            armed = null
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("mouseup", onUp)
          }

          const onMove = (e: MouseEvent) => {
            if (!armed) return
            if (
              Math.abs(e.clientX - armed.x) > CLICK_THRESHOLD_PX ||
              Math.abs(e.clientY - armed.y) > CLICK_THRESHOLD_PX
            ) {
              clear()
            }
          }

          const onUp = (e: MouseEvent) => {
            if (!armed) return
            const start = armed
            clear()
            if (
              Math.abs(e.clientX - start.x) > CLICK_THRESHOLD_PX ||
              Math.abs(e.clientY - start.y) > CLICK_THRESHOLD_PX
            ) {
              return
            }
            dispatchTailClick(view)
          }

          const onDown = (event: MouseEvent) => {
            if (event.button !== 0) return
            if (armed != null) return
            if (!(event.target instanceof Element)) return

            // While MBS is active, the document-level outside-click handler
            // in block-selection/plugin.ts dismisses MBS on this same
            // pointerdown. Tail-click bails so a tail click while in MBS
            // only clears the selection — it doesn't also append a fresh
            // paragraph. A subsequent click (now without MBS) re-enters
            // the normal tail-click path.
            if (view.state.selection instanceof MultiBlockSelection) return

            // Nested-editor isolation. The listener attaches to the
            // nearest .rune-editor ancestor, but events bubble: a click
            // in a nested editor's wrapper reaches both the child's
            // listener AND the parent's. Reject when the target's
            // nearest .rune-editor isn't this view's.
            const own = ownEditor()
            if (!own) return
            if (event.currentTarget !== own) return
            if (event.target.closest(".rune-editor") !== own) return

            // Cede to whoever owns these regions. .rune-block → PM /
            // BlockSelection; chrome → side-menu / popovers.
            if (event.target.closest(".rune-block")) return
            if (event.target.closest(".rune-side-menu-grip")) return
            if (event.target.closest("[data-radix-popper-content-wrapper]")) return

            // Only fire when the click is BELOW the last block. A click
            // beside a short last block (in the side-padding region) is
            // marquee territory, not append.
            const last = lastBlockDOM(view)
            if (!last) return
            if (event.clientY <= last.getBoundingClientRect().bottom) return

            armed = { x: event.clientX, y: event.clientY }
            window.addEventListener("mousemove", onMove)
            window.addEventListener("mouseup", onUp)
          }

          const off = onEditorWrapperMouseDown(view, onDown)
          return {
            destroy() {
              off()
              clear()
            },
          }
        },
      }),
    ]
  },
})

function lastBlockDOM(view: EditorView): HTMLElement | null {
  const { doc } = view.state
  if (doc.childCount === 0) return null
  let pos = 0
  for (let i = 0; i < doc.childCount - 1; i++) pos += doc.child(i).nodeSize
  const dom = view.nodeDOM(pos)
  return dom instanceof HTMLElement ? dom : null
}

function dispatchTailClick(view: EditorView): void {
  const { state } = view
  const { doc, schema } = state
  if (doc.childCount === 0) return

  const lastBlock = doc.child(doc.childCount - 1)
  const docEnd = doc.content.size

  // Empty tail of the same type we'd append — refocus, don't append.
  // This is what enforces "at most one new paragraph per click chain".
  // Only paragraph qualifies: heading / toggle title also satisfy
  // `isTextblock && content.size === 0` but are different block types,
  // and refocusing into them would no-op the click.
  if (lastBlock.type.name === TAIL_APPEND_TYPE && lastBlock.content.size === 0) {
    view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, docEnd - 1)).scrollIntoView(),
    )
    view.focus()
    return
  }

  const paragraphType = schema.nodes[TAIL_APPEND_TYPE]
  if (!paragraphType) return
  const tr = state.tr.insert(docEnd, paragraphType.create())
  // Inserted paragraph occupies [docEnd, docEnd + 2); caret inside is at
  // docEnd + 1 in the post-insert doc.
  tr.setSelection(TextSelection.create(tr.doc, docEnd + 1))
  view.dispatch(tr.scrollIntoView())
  view.focus()
}
