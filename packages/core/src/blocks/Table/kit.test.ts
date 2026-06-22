// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit } from "../../kit"
import type { SuggestionOptions } from "@tiptap/suggestion"
import { BLOCK_COLOR_TYPES, deriveBlockColorTypes } from "../../kit"
import { createBlockSpec } from "../../schema"

describe("Table — kit integration", () => {
  it("registers table sub-structure nodes through the default kit", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })

    expect(editor.schema.nodes.table).toBeDefined()
    expect(editor.schema.nodes.tableRow).toBeDefined()
    expect(editor.schema.nodes.tableCell).toBeDefined()
    expect(editor.schema.nodes.tableHeader).toBeDefined()
    expect(editor.schema.nodes.tableParagraph).toBeDefined()
    expect(editor.schema.nodes.tableRow!.spec.group).toBeUndefined()
    expect(editor.schema.nodes.tableCell!.spec.group).toBeUndefined()
    expect(editor.schema.nodes.tableHeader!.spec.group).toBeUndefined()
    expect(editor.schema.nodes.tableParagraph!.spec.group).toBe("tableContent")

    editor.destroy()
  })

  it("keeps table support extensions registered once", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })

    for (const name of [
      "tableCommands",
      "tableSupport",
      "tableMergedCellsGuard",
      "cellSelectionEdges",
      "tableMouseSelection",
      "pinColumnWidths",
    ]) {
      expect(editor.extensionManager.extensions.filter((ext) => ext.name === name)).toHaveLength(1)
    }

    editor.destroy()
  })

  it("BlockId scans 'table' and not its sub-structure nodes", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })
    const blockId = editor.extensionManager.extensions.find((e) => e.name === "blockId")!
    const types = (blockId.options as { types: string[] }).types
    expect(types).toContain("paragraph")
    expect(types).toContain("table")
    expect(types).toContain("tableOfContents")
    expect(types).not.toContain("tableRow")
    expect(types).not.toContain("tableCell")
    expect(types).not.toContain("tableHeader")
    expect(types).not.toContain("tableParagraph")
    expect(types).not.toContain("mediaImport")
    expect(types).not.toContain("mediaPopover")
    editor.destroy()
  })

  it("registers Rune table commands in the default kit", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })

    expect(typeof editor.commands.insertTable).toBe("function")
    expect(typeof editor.commands.addTableRowAfter).toBe("function")
    expect(typeof editor.commands.addTableColumnAfter).toBe("function")
    expect(typeof editor.commands.deleteTable).toBe("function")

    editor.destroy()
  })

  it("default insertTable command creates tableParagraph cell content", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })

    expect(editor.commands.insertTable({ rows: 2, cols: 2 })).toBe(true)

    const firstTable = editor.state.doc.firstChild
    expect(firstTable?.type.name).toBe("table")

    const firstRow = firstTable?.firstChild
    const firstCell = firstRow?.firstChild
    expect(firstCell?.firstChild?.type.name).toBe("tableParagraph")

    editor.destroy()
  })

  it("default '/' trigger's allow callback returns false inside a table cell", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })
    editor.commands.setContent(
      "<table><tbody><tr><th>x</th></tr></tbody></table>",
    )

    // Walk the doc to find the first tableParagraph and land the caret
    // inside it. This is more reliable than arithmetic on offsets.
    let cellCaretPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (cellCaretPos !== -1) return false
      if (node.type.name === "tableParagraph") {
        // pos is the node-start; +1 is the first content position inside it
        cellCaretPos = pos + 1
        return false
      }
      return true
    })
    expect(cellCaretPos).toBeGreaterThan(0)

    editor.commands.setTextSelection(cellCaretPos)

    const suggestionExt = editor.extensionManager.extensions.find(
      (e) => e.name === "suggestionMenus",
    )!
    const triggers = (
      suggestionExt.options as { triggers: Array<{ char: string; allow?: SuggestionOptions["allow"] }> }
    ).triggers
    const slash = triggers.find((t) => t.char === "/")!
    expect(slash).toBeDefined()
    expect(slash.allow).toBeDefined()

    const result = slash.allow!({
      editor,
      state: editor.state,
      range: { from: editor.state.selection.from, to: editor.state.selection.to },
    })
    expect(result).toBe(false)
    editor.destroy()
  })
})

describe("createRuneKit — table cell color attrs", () => {
  it("parses + renders backgroundColor on <td> via the default kit", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })
    editor.commands.setContent(
      "<table><tbody><tr><td data-background-color=\"blue\"><p>x</p></td></tr></tbody></table>",
    )
    let cellAttr: unknown = undefined
    editor.state.doc.descendants((node) => {
      if (node.type.name === "tableCell") {
        cellAttr = node.attrs.backgroundColor
        return false
      }
      return true
    })
    expect(cellAttr).toBe("blue")
    expect(editor.getHTML()).toContain('data-background-color="blue"')
    editor.destroy()
  })

  it("parses + renders textColor on <th> via the default kit", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createRuneKit(),
    })
    editor.commands.setContent(
      "<table><tbody><tr><th data-text-color=\"red\"><p>x</p></th></tr></tbody></table>",
    )
    let headerAttr: unknown = undefined
    editor.state.doc.descendants((node) => {
      if (node.type.name === "tableHeader") {
        headerAttr = node.attrs.textColor
        return false
      }
      return true
    })
    expect(headerAttr).toBe("red")
    expect(editor.getHTML()).toContain('data-text-color="red"')
    editor.destroy()
  })

  it("BLOCK_COLOR_TYPES includes tableCell and tableHeader", async () => {
    expect(BLOCK_COLOR_TYPES).toContain("tableCell")
    expect(BLOCK_COLOR_TYPES).toContain("tableHeader")
  })

  it("derives block color types from block supports metadata plus table cells", () => {
    const Colorable = createBlockSpec({
      type: "colorable",
      content: "inline*",
      supports: { textColor: true, backgroundColor: true },
      parseDOM: [{ tag: "p[data-colorable]" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
    })
    const Plain = createBlockSpec({
      type: "plain",
      content: "inline*",
      parseDOM: [{ tag: "p[data-plain]" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
    })

    expect(deriveBlockColorTypes([Colorable, Plain])).toEqual([
      "colorable",
      "tableCell",
      "tableHeader",
    ])
  })
})
