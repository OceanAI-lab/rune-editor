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
import { isRuneTableChromeEventTarget, updateRuneTableColumns } from "./RuneTableView"

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document,
      Text,
      Paragraph,
      Table,
    ],
  })
}

function tableRoot(editor: Editor) {
  return editor.view.dom.querySelector('.rune-block[data-block-type="table"]') as HTMLDivElement | null
}

function firstCellParagraphPos(editor: Editor) {
  let pos = -1
  editor.state.doc.descendants((node, nodePos) => {
    if (pos !== -1) return false
    if (node.type.name === "tableParagraph") {
      pos = nodePos + 1
      return false
    }
    return true
  })
  return pos
}

describe("RuneTableView", () => {
  it("renders the Rune table DOM with colgroup before tbody", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "tableParagraph" }] },
                { type: "tableHeader", content: [{ type: "tableParagraph" }] },
              ],
            },
          ],
        },
      ],
    })

    const root = tableRoot(editor)
    expect(root).not.toBeNull()
    expect(root?.dataset.id).toBe("t")
    expect(root?.hasAttribute("data-depth")).toBe(false)
    const content = root?.querySelector(":scope > .rune-block-content")
    const scroll = content?.querySelector(":scope > .rune-table-scroll")
    const contentTrack = scroll?.querySelector(":scope > .rune-table-content")
    const chromePadding = contentTrack?.querySelector(":scope > .rune-table-chrome-padding")
    const frame = chromePadding?.querySelector(":scope > .rune-table-frame")
    const table = frame?.querySelector(":scope > table.rune-table")
    expect(table).not.toBeNull()
    expect(table?.children[0]?.tagName).toBe("COLGROUP")
    expect(table?.children[1]?.tagName).toBe("TBODY")
    expect(table?.querySelectorAll("colgroup > col")).toHaveLength(2)
    editor.destroy()
  })

  it("preserves root classes across NodeView updates", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "tableParagraph" }] }] },
          ],
        },
      ],
    })

    const root = tableRoot(editor)!
    root.classList.add("extra-class")
    const tablePos = 0
    editor.view.dispatch(editor.state.tr.setNodeMarkup(tablePos, undefined, { ...editor.state.doc.firstChild?.attrs, depth: 1 }))

    expect(root.classList.contains("rune-block")).toBe(true)
    expect(root.classList.contains("extra-class")).toBe(true)
    expect(root.dataset.depth).toBe("1")
    editor.destroy()
  })

  it("keeps the table spec isolating", () => {
    const editor = makeEditor()
    expect(editor.schema.nodes.table?.spec.isolating).toBe(true)
    editor.destroy()
  })

  it("syncs col widths from colwidth attrs", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colwidth: [120] }, content: [{ type: "tableParagraph" }] },
                { type: "tableCell", attrs: { colwidth: [180] }, content: [{ type: "tableParagraph" }] },
              ],
            },
          ],
        },
      ],
    })

    const table = tableRoot(editor)?.querySelector("table") as HTMLTableElement
    const cols = table.querySelectorAll("colgroup > col")
    expect(cols).toHaveLength(2)
    expect(cols.item(0)?.getAttribute("style")).toContain("120px")
    expect(cols.item(1)?.getAttribute("style")).toContain("180px")
    expect(table.style.width).toBe("300px")
    expect(table.style.minWidth).toBe("")
    editor.destroy()
  })

  it("applies minWidth to widthless columns", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "tableParagraph" }] },
                { type: "tableCell", content: [{ type: "tableParagraph" }] },
              ],
            },
          ],
        },
      ],
    })

    const table = tableRoot(editor)?.querySelector("table") as HTMLTableElement
    const cols = table.querySelectorAll("colgroup > col")
    expect(cols).toHaveLength(2)
    expect((cols.item(0) as HTMLTableColElement | null)?.style.width).toBe("")
    expect((cols.item(0) as HTMLTableColElement | null)?.style.minWidth).toBe("120px")
    expect((cols.item(1) as HTMLTableColElement | null)?.style.minWidth).toBe("120px")
    expect(table.style.width).toBe("")
    expect(table.style.minWidth).toBe("240px")
    editor.destroy()
  })

  it("uses minWidth for mixed fixed and unfixed columns", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colwidth: [80] }, content: [{ type: "tableParagraph" }] },
                { type: "tableCell", content: [{ type: "tableParagraph" }] },
              ],
            },
          ],
        },
      ],
    })

    const table = tableRoot(editor)?.querySelector("table") as HTMLTableElement
    expect(table.style.width).toBe("")
    expect(table.style.minWidth).toBe("200px")
    editor.destroy()
  })

  it("treats table chrome outside the table as NodeView-owned event surface", () => {
    const doc = document
    const scroll = doc.createElement("div")
    scroll.className = "rune-table-scroll"
    const content = doc.createElement("div")
    content.className = "rune-table-content"
    const chrome = doc.createElement("div")
    chrome.className = "rune-table-chrome-padding"
    const frame = doc.createElement("div")
    frame.className = "rune-table-frame"
    const table = doc.createElement("table")
    table.className = "rune-table"
    const cell = doc.createElement("td")
    const colPill = doc.createElement("div")
    colPill.className = "rune-col-pill"
    const extendCol = doc.createElement("button")
    extendCol.className = "rune-table-extend-col"

    table.append(cell)
    frame.append(table, colPill, extendCol)
    chrome.append(frame)
    content.append(chrome)
    scroll.append(content)

    expect(isRuneTableChromeEventTarget(frame)).toBe(true)
    expect(isRuneTableChromeEventTarget(chrome)).toBe(true)
    expect(isRuneTableChromeEventTarget(table)).toBe(false)
    expect(isRuneTableChromeEventTarget(cell)).toBe(false)
    expect(isRuneTableChromeEventTarget(colPill)).toBe(false)
    expect(isRuneTableChromeEventTarget(extendCol)).toBe(false)
  })

  it("updates the colgroup when adding a column", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "tableParagraph" }] }] },
          ],
        },
      ],
    })

    const pos = firstCellParagraphPos(editor)
    expect(pos).toBeGreaterThan(0)
    editor.commands.setTextSelection(pos)
    expect(editor.commands.addTableColumnAfter()).toBe(true)
    expect(tableRoot(editor)?.querySelectorAll("colgroup > col")?.length).toBe(2)
    editor.destroy()
  })

  it("reflects live colwidth updates on the col element and table width", () => {
    // Smoke for the columnResizing live-preview path: when a transaction
    // changes a cell's colwidth attr (which is what columnResizing's drag
    // does), the NodeView's update() must re-sync the <col> style and the
    // table width. Without the override-args path that Tiptap's TableView
    // exposes, this is the only way live width changes reach the DOM —
    // make it regression-tested.
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colwidth: [120] }, content: [{ type: "tableParagraph" }] },
                { type: "tableCell", attrs: { colwidth: [180] }, content: [{ type: "tableParagraph" }] },
              ],
            },
          ],
        },
      ],
    })

    const table = tableRoot(editor)?.querySelector("table") as HTMLTableElement
    const cols = () => table.querySelectorAll("colgroup > col")
    expect((cols().item(0) as HTMLTableColElement).style.width).toBe("120px")
    expect(table.style.width).toBe("300px")

    // Walk to the first tableCell and bump its colwidth — mirrors what
    // columnResizing dispatches mid-drag.
    let cellPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (cellPos !== -1) return false
      if (node.type.name === "tableCell") {
        cellPos = pos
        return false
      }
      return true
    })
    expect(cellPos).toBeGreaterThan(-1)
    const cellNode = editor.state.doc.nodeAt(cellPos)!
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(cellPos, undefined, { ...cellNode.attrs, colwidth: [200] }),
    )

    expect((cols().item(0) as HTMLTableColElement).style.width).toBe("200px")
    expect(table.style.width).toBe("380px")
    editor.destroy()
  })

  it("drops stale cols and shrinks table width after column deletion", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colwidth: [120] }, content: [{ type: "tableParagraph" }] },
                { type: "tableCell", attrs: { colwidth: [180] }, content: [{ type: "tableParagraph" }] },
                { type: "tableCell", attrs: { colwidth: [240] }, content: [{ type: "tableParagraph" }] },
              ],
            },
          ],
        },
      ],
    })

    const table = tableRoot(editor)?.querySelector("table") as HTMLTableElement
    const node = editor.state.doc.firstChild!
    const colgroup = table.querySelector("colgroup")!
    colgroup.appendChild(table.ownerDocument.createElement("col"))

    const twoColNode = node.type.create(node.attrs, [
      node.firstChild!.type.create(node.firstChild!.attrs, [node.firstChild!.firstChild!, node.firstChild!.child(1)]),
    ])

    updateRuneTableColumns(table, twoColNode, 120)

    expect(table.querySelectorAll("colgroup > col")).toHaveLength(2)
    expect(table.style.width).toBe("300px")
    expect(table.style.minWidth).toBe("")
    editor.destroy()
  })
})
