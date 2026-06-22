// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../../Paragraph/block"
import { Table } from "../block"
import { resolveTableFromFrame } from "./resolveTableFromFrame"

let editor: Editor | null = null
function makeEditor() {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      Document, Text, Paragraph,
      Table,
    ],
  })
  return editor
}
afterEach(() => { editor?.destroy(); editor = null })

describe("resolveTableFromFrame", () => {
  it("returns ResolvedTable for a single-table doc", () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 2 })
    const frame = editor.view.dom.querySelector(".rune-table-frame") as HTMLElement
    expect(frame).not.toBeNull()

    const ctx = resolveTableFromFrame(editor.view, frame)
    expect(ctx).not.toBeNull()
    expect(ctx!.tableNode.type.name).toBe("table")
    expect(ctx!.tableStart).toBe(ctx!.tablePos + 1)
    expect(ctx!.map.width).toBe(2)
    expect(ctx!.map.height).toBe(2)
  })

  it("disambiguates between two tables in the same doc", () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 2 })
    editor.commands.setTextSelection(editor.state.doc.content.size)
    editor.commands.insertTable({ rows: 3, cols: 3 })

    const frames = editor.view.dom.querySelectorAll(".rune-table-frame")
    expect(frames.length).toBe(2)

    const ctx1 = resolveTableFromFrame(editor.view, frames[0] as HTMLElement)
    const ctx2 = resolveTableFromFrame(editor.view, frames[1] as HTMLElement)
    expect(ctx1!.map.width).toBe(2)
    expect(ctx2!.map.width).toBe(3)
    expect(ctx1!.tablePos).toBeLessThan(ctx2!.tablePos)
  })

  it("returns the new (shifted) tablePos after a paragraph is inserted before the table", () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 2 })
    const frame = editor.view.dom.querySelector(".rune-table-frame") as HTMLElement
    const beforePos = resolveTableFromFrame(editor.view, frame)!.tablePos

    // Insert a paragraph at position 0 (before the table node).
    // setTextSelection(0) would be clamped to inside the table; use
    // insertContentAt with updateSelection:false so the table shifts.
    editor.commands.insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "hello" }] })

    const afterPos = resolveTableFromFrame(editor.view, frame)!.tablePos
    expect(afterPos).toBeGreaterThan(beforePos)
  })

  it("returns null when the frame element is detached from the doc", () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 2 })
    const frame = editor.view.dom.querySelector(".rune-table-frame") as HTMLElement
    frame.remove()

    const ctx = resolveTableFromFrame(editor.view, frame)
    expect(ctx).toBeNull()
  })
})
