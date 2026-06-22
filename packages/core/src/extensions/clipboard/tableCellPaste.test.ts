// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor, Extension } from "@tiptap/core"
import { Plugin, TextSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import {
  CellSelection,
  addColumnAfter,
  TableMap,
} from "@tiptap/pm/tables"
import { Slice } from "@tiptap/pm/model"
import { createRuneKit as kit } from "../../kit"
import { writeClipboard } from "./writeClipboard"
import { buildClipboardSerializer } from "./serializer"

/**
 * End-to-end regression for the table cell copy/paste corruption:
 * copying a multi-row CellSelection and pasting it into a (widened)
 * table must tile the rectangle from the target cell — NOT corrupt the
 * grid into extra rows/columns with only the first row populated.
 *
 * The test drives the editor's REAL registered `handlePaste` plugin
 * chain in document order (the same way PM's `someProp` does), so it
 * verifies the actual wiring: rune-clipboard yields inside a table and
 * prosemirror-tables' cell-aware handler takes over. A regression that
 * re-broadens rune's handler would make rune intercept first and fail
 * the grid assertions below.
 */

function makeEditor(content: string) {
  const SerializerExt = Extension.create({
    name: "clipboard-serializer-test",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: { clipboardSerializer: buildClipboardSerializer(this.editor) },
        }),
      ]
    },
  })
  return new Editor({
    extensions: [...kit(), SerializerExt],
    content,
    element: document.createElement("div"),
  })
}

function makeEvent(store = new Map<string, string>()): ClipboardEvent {
  const data = {
    get types() { return Array.from(store.keys()) },
    clearData: () => store.clear(),
    setData: (m: string, v: string) => store.set(m, v),
    getData: (m: string) => store.get(m) ?? "",
  } as unknown as DataTransfer
  let dp = false
  return {
    clipboardData: data,
    get defaultPrevented() { return dp },
    preventDefault: () => { dp = true },
  } as unknown as ClipboardEvent
}

// Drive the editor's registered handlePaste props in plugin order, the
// way PM's someProp does: stop at the first handler that returns true.
function runHandlePasteChain(
  view: EditorView,
  event: ClipboardEvent,
  slice: Slice,
): boolean {
  for (const p of view.state.plugins) {
    const fn = (p as unknown as {
      props?: { handlePaste?: (v: EditorView, e: Event, s: Slice) => boolean }
    }).props?.handlePaste
    if (fn && fn(view, event as unknown as Event, slice)) return true
  }
  return false
}

function build6x2(): string {
  let html = "<table>"
  for (let r = 1; r <= 6; r++) {
    html += `<tr><td><p>r${r}c1</p></td><td><p>r${r}c2</p></td></tr>`
  }
  return html + "</table>"
}

function rowsText(editor: Editor): string[][] {
  const rows: string[][] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableRow") {
      const cells: string[] = []
      node.forEach((c) => cells.push(c.textContent))
      rows.push(cells)
    }
  })
  return rows
}

function tableMap(editor: Editor): { tablePos: number; map: TableMap } {
  let tablePos = -1
  editor.state.doc.forEach((n, pos) => {
    if (n.type.name === "table") tablePos = pos
  })
  const table = editor.state.doc.nodeAt(tablePos)!
  return { tablePos, map: TableMap.get(table) }
}

function caretInCell(editor: Editor, rowIndex: number, colIndex: number) {
  const { tablePos, map } = tableMap(editor)
  const cellPos = tablePos + 1 + map.map[rowIndex * map.width + colIndex]!
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.near(editor.state.doc.resolve(cellPos + 2)),
    ),
  )
}

function selectRect(
  editor: Editor,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
) {
  const { tablePos, map } = tableMap(editor)
  const anchor = tablePos + 1 + map.map[r0 * map.width + c0]!
  const head = tablePos + 1 + map.map[r1 * map.width + c1]!
  editor.view.dispatch(
    editor.state.tr.setSelection(
      CellSelection.create(editor.state.doc, anchor, head),
    ),
  )
}

describe("table cell copy/paste — multi-row rectangle into a widened table", () => {
  it("tiles the copied rectangle from the target cell instead of corrupting the grid", () => {
    const editor = makeEditor(build6x2())

    // Copy rows 3-6 (index 2..5), both columns → a 4x2 rectangle.
    selectRect(editor, 2, 0, 5, 1)
    const store = new Map<string, string>()
    const copied = writeClipboard(editor.view, makeEvent(store), false)
    expect(copied).toBe(true)

    // Widen the table to 4 columns (the user's "created 3rd and 4th column").
    caretInCell(editor, 0, 1)
    addColumnAfter(editor.state, editor.view.dispatch)
    caretInCell(editor, 0, 2)
    addColumnAfter(editor.state, editor.view.dispatch)

    // The slice PM would hand to handlers (cells round-trip identically
    // through HTML or rune-doc JSON).
    const slice = Slice.fromJSON(
      editor.state.schema,
      JSON.parse(store.get("application/x-rune-doc")!),
    )

    // Paste with the caret at row 3 (idx 2), column 3 (idx 2).
    caretInCell(editor, 2, 2)
    const handled = runHandlePasteChain(editor.view, makeEvent(store), slice)
    expect(handled).toBe(true)

    const rows = rowsText(editor)
    // Grid stays 6 rows × 4 columns — no extra rows, no extra columns.
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.length === 4)).toBe(true)
    // The full 4x2 rectangle tiled into cols 3-4, rows 3-6.
    expect(rows[2]).toEqual(["r3c1", "r3c2", "r3c1", "r3c2"])
    expect(rows[3]).toEqual(["r4c1", "r4c2", "r4c1", "r4c2"])
    expect(rows[4]).toEqual(["r5c1", "r5c2", "r5c1", "r5c2"])
    expect(rows[5]).toEqual(["r6c1", "r6c2", "r6c1", "r6c2"])
    // Untouched cells stay empty / unchanged.
    expect(rows[0]).toEqual(["r1c1", "r1c2", "", ""])
    expect(rows[1]).toEqual(["r2c1", "r2c2", "", ""])

    editor.destroy()
  })
})
