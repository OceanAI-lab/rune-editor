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
import { buildClipboardSerializer } from "../../extensions/clipboard/serializer"
import { Table } from "./block"
import { getBlockSpecs } from "../../schema"

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

describe("Table block", () => {
  it("declares fit-to-width support metadata", () => {
    const editor = makeEditor()
    expect(getBlockSpecs(editor).table?.supports).toMatchObject({
      fitToWidth: true,
    })
    editor.destroy()
  })

  it("renderDOM produces semantic table chrome wrappers around the table", () => {
    const editor = makeEditor()
    const schema = editor.schema
    // Non-null assertions: these nodes are registered in makeEditor's extensions.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tableNode = schema.nodes.table!.create(
      { id: "t", depth: 0 },
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      schema.nodes.tableRow!.create(
        null,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        schema.nodes.tableHeader!.create(null, schema.nodes.tableParagraph!.create()),
      ),
    )
    editor.commands.setContent({
      type: "doc",
      content: [tableNode.toJSON()],
    })
    const html = editor.getHTML()
    expect(html).toContain('class="rune-block"')
    expect(html).toContain('class="rune-block-content"')
    expect(html).toContain('class="rune-table-scroll"')
    expect(html).toContain('class="rune-table-content"')
    expect(html).toContain('class="rune-table-chrome-padding"')
    expect(html).toContain('class="rune-table-frame"')
    expect(html).toContain('class="rune-table"')
    expect(html).toContain("data-block-type=\"table\"")
    expect(html).toMatch(/<table[^>]*>/)
    editor.destroy()
  })

  it("clipboardRenderDOM emits clean <table> with no rune chrome / data attrs", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "t1", depth: 0 },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "tableParagraph", content: [{ type: "text", text: "A" }] }] },
                { type: "tableHeader", content: [{ type: "tableParagraph", content: [{ type: "text", text: "B" }] }] },
              ],
            },
          ],
        },
      ],
    })
    // Select the entire table block and serialize the slice using the
    // clipboard serializer (which respects clipboardRenderDOM).
    editor.commands.selectAll()
    const slice = editor.state.selection.content()
    const fragment = editor.view.dom.ownerDocument.createElement("div")
    const ser = buildClipboardSerializer(editor)
    fragment.appendChild(ser.serializeFragment(slice.content))
    const html = fragment.innerHTML
    expect(html).toMatch(/<table[^>]*>/)
    expect(html).not.toContain("data-id")
    expect(html).not.toContain("data-depth")
    expect(html).not.toContain("rune-block")
    expect(html).not.toContain("rune-table-scroll")
    editor.destroy()
  })

  it("merged cells in pasted HTML are expanded — colspan=2 → two cells", () => {
    const editor = makeEditor()
    editor.commands.setContent(
      '<table><tbody><tr><td colspan="2">x</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>',
      { emitUpdate: false, parseOptions: { preserveWhitespace: false } },
    )
    const tableNode = editor.state.doc.firstChild!
    const firstRow = tableNode.firstChild!
    expect(firstRow.childCount).toBe(2)
    firstRow.forEach((cell) => {
      expect(cell.attrs.colspan).toBe(1)
      expect(cell.attrs.rowspan).toBe(1)
    })
    editor.destroy()
  })

  it("tableParagraph parseDOM rejects <p> outside table cells", () => {
    // Round-trip through setContent: a <p> at top level becomes
    // page-body paragraph, never tableParagraph.
    const editor = makeEditor()
    editor.commands.setContent("<p>hello</p>")
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    editor.destroy()
  })

  it("paragraph parseDOM rejects <p> inside <td> — those become tableParagraph", () => {
    const editor = makeEditor()
    editor.commands.setContent(
      "<table><tbody><tr><td><p>cell</p></td></tr></tbody></table>",
    )
    const td = editor.state.doc.firstChild!.firstChild!.firstChild!
    expect(td.firstChild?.type.name).toBe("tableParagraph")
    editor.destroy()
  })

  it("toRuneBlock projects rows/cells/isHeader correctly", () => {
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
                { type: "tableHeader", content: [{ type: "tableParagraph", content: [{ type: "text", text: "H1" }] }] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "tableParagraph", content: [{ type: "text", text: "C1" }] }] },
              ],
            },
          ],
        },
      ],
    })
    const node = editor.state.doc.firstChild!
    // toRuneBlock is stored in extension.storage (via addStorage in createBlockSpec).
    // Access it through the extensionManager.
    const tableExt = editor.extensionManager.extensions.find((e) => e.name === "table")!
    const toRuneBlock = (tableExt.storage as { toRuneBlock: (n: unknown) => unknown }).toRuneBlock
    const projected = toRuneBlock(node) as {
      type: string
      rows: { cells: { text: string }[]; isHeader: boolean }[]
    }
    expect(projected.type).toBe("table")
    expect(projected.rows).toHaveLength(2)
    expect(projected.rows[0]).toEqual({ cells: [{ text: "H1" }], isHeader: true })
    expect(projected.rows[1]).toEqual({ cells: [{ text: "C1" }], isHeader: false })
    editor.destroy()
  })
})
