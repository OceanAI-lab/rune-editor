// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../Paragraph/block"
import { Table } from "./block"
import { INTERNAL_NORMALIZATION_META } from "../../extensions/internal-meta"

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document, Text, Paragraph,
      Table,
    ],
  })
}

function firstCellPos(editor: Editor): number {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (pos !== -1) return false
    const role = node.type.spec.tableRole
    if (role === "cell" || role === "header_cell") pos = p
    return true
  })
  if (pos < 0) throw new Error("no cell found")
  return pos
}

describe("TableMergedCellsGuard appendTransaction", () => {
  it("clamps colspan>1 back to 1 and tags the appended tx as internal normalization", () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 2 })

    const cellPos = firstCellPos(editor)
    const cell = editor.state.doc.nodeAt(cellPos)
    if (!cell) throw new Error("cell missing at " + cellPos)
    // Programmatically introduce a merged cell — bypasses transformPastedHTML.
    const tr = editor.state.tr.setNodeMarkup(cellPos, undefined, {
      ...cell.attrs,
      colspan: 2,
    })

    const { state: nextState, transactions } = editor.state.applyTransaction(tr)

    // Find OUR clamp tx by its meta — prosemirror-tables may append further
    // fixpoint trs after ours, so we can't assume position in the list.
    const guardTx = transactions.find(
      (t) => t.getMeta(INTERNAL_NORMALIZATION_META) === true,
    )
    expect(guardTx).toBeDefined()

    // Regression: the guard's appendTransaction must mark the tx so consumers
    // detecting "did the user edit" can ignore it. Both metas are required:
    //   - addToHistory:false → keeps undo out of the merged-cell intermediate
    //   - INTERNAL_NORMALIZATION_META → the canonical "not a user edit" signal
    expect(guardTx!.getMeta("addToHistory")).toBe(false)

    // And the clamp actually happened.
    const clamped = nextState.doc.nodeAt(cellPos)
    expect(clamped?.attrs.colspan).toBe(1)

    editor.destroy()
  })

  it("returns null (no appended tx) when no merged cells exist", () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 2 })

    // No-op edit just to drive appendTransaction.
    const tr = editor.state.tr.insertText("x", editor.state.selection.from)
    const { transactions } = editor.state.applyTransaction(tr)

    // Only the original tr — guard returned null.
    expect(transactions).toHaveLength(1)
    editor.destroy()
  })
})
