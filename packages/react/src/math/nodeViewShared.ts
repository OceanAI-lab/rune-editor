// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"

// Resolve the popover anchor rect off a NodeView root. JSDOM returns
// 0/0/0/0 for getBoundingClientRect (no layout engine), which Radix treats
// as "no anchor" and refuses to position the popover. Substitute a 1×1
// rect so tests rendering math + popover don't crash; real browsers always
// return a non-zero rect for the rendered KaTeX span/div.
export function mathAnchorRect(element: HTMLElement | null): DOMRect | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width > 0 || rect.height > 0 || rect.x !== 0 || rect.y !== 0) {
    return rect
  }
  return new DOMRect(1, 1, 1, 1)
}

export function selectNode(
  editor: Editor,
  getPos: () => number | undefined,
): boolean {
  if (!editor.isEditable) return false
  const pos = getPos()
  if (typeof pos !== "number") return false
  const ok = editor.commands.setNodeSelection(pos)
  if (ok) editor.view.focus()
  return ok
}

export function deleteNode(
  editor: Editor,
  node: PMNode,
  getPos: () => number | undefined,
  options: { addToHistory?: boolean } = {},
) {
  if (!editor.isEditable) return
  const pos = getPos()
  if (typeof pos !== "number") return
  const tr = editor.state.tr.delete(pos, pos + node.nodeSize)
  if (options.addToHistory === false) tr.setMeta("addToHistory", false)
  editor.view.dispatch(tr)
}

// Replace an inline math atom with a plain text node carrying the
// original selection text. Used when a wrap-from-selection popover is
// dismissed without an explicit commit — the wrap is undone in place so
// the user's prose is restored verbatim. Empty `text` falls through to
// deleteNode so we never try to construct a zero-length text node
// (which the PM schema rejects).
export function replaceNodeWithText(
  editor: Editor,
  node: PMNode,
  getPos: () => number | undefined,
  text: string,
  options: { addToHistory?: boolean } = {},
) {
  if (!editor.isEditable) return
  const pos = getPos()
  if (typeof pos !== "number") return
  if (!text) {
    deleteNode(editor, node, getPos, options)
    return
  }
  const tr = editor.state.tr.replaceWith(
    pos,
    pos + node.nodeSize,
    editor.state.schema.text(text),
  )
  if (options.addToHistory === false) tr.setMeta("addToHistory", false)
  editor.view.dispatch(tr)
}
