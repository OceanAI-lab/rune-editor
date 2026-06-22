// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { getTextSerializersFromSchema } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"
import type { Slice } from "@tiptap/pm/model"
import { expandCollapsedToggles } from "../../blocks/Toggle/expandSlice"

/**
 * Serialize a slice of the doc for the clipboard. Pure function — does not
 * write to the clipboard, mutate selection, or touch the DOM. Returns the
 * same three payloads that `writeClipboard` emits in response to a live
 * `copy` event:
 *   - text/html — goes through the plugin's `clipboardSerializer`, which
 *     prefers each block's `clipboardRenderDOM` over `renderDOM` and so
 *     produces chrome-free HTML (no `.rune-block` wrapper, no `data-id` /
 *     `data-depth`).
 *   - text/plain — text projection of the resolved slice using each
 *     node's Tiptap `renderText` serializer.
 *   - application/x-rune-doc — JSON of `slice.toJSON()` for lossless
 *     round-trips back into a rune editor.
 *
 * Why expose this: button-triggered copy (side-menu, downstream document
 * headers) has no live ClipboardEvent to hand off to `writeClipboard`, so
 * the only options are (a) hand-rolling DOM serialization with the wrong
 * codepath — what `editor.getHTML()` does, which uses `renderDOM` and
 * leaks chrome attrs into the clipboard — or (b) using this helper.
 * Cmd+C and button-copy must agree on output; centralizing both here is
 * the smallest seam that guarantees it.
 *
 * `slice` defaults to the current selection's content. Pass an explicit
 * slice (e.g. `editor.state.doc.slice(0, doc.content.size)` for whole-doc)
 * when the caller's range doesn't match selection.
 *
 * Collapsed toggles: before serialization, `expandCollapsedToggles` splices
 * each collapsed toggle's hidden body immediately after the toggle in the
 * slice, so copy/paste always carries the full content even when the body
 * is invisible. Both Cmd-C and button-copy go through this path.
 */
export function serializeBlocksForClipboard(
  view: EditorView,
  slice?: Slice,
): { html: string; text: string; runeDocJson: string } {
  const raw = slice ?? view.state.selection.content()
  const resolved = expandCollapsedToggles(raw, view.state.doc)
  const { dom } = view.serializeForClipboard(resolved)
  const textSerializers = getTextSerializersFromSchema(view.state.schema)
  const text = resolved.content.textBetween(
    0,
    resolved.content.size,
    "\n\n",
    (leaf) => {
      const fn = textSerializers[leaf.type.name]
      return fn
        ? fn({
            node: leaf,
            pos: 0,
            parent: leaf,
            index: 0,
            range: { from: 0, to: resolved.content.size },
          })
        : ""
    },
  )
  // slice.toJSON() returns null for an empty slice — JSON.stringify(null)
  // is "null", which the paste handler treats as "no rune payload".
  return {
    html: dom.innerHTML,
    text,
    runeDocJson: JSON.stringify(resolved.toJSON()),
  }
}
