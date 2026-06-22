// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Fragment } from "@tiptap/pm/model"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { blockFromNode, getDocument } from "../../api/queries/getDocument"
import { getBlockById } from "../../api/queries/getBlockById"
import { findBlocks } from "../../api/queries/findBlocks"
import { deriveBlockIdTypes, RUNE_BODY_BLOCKS } from "../defaultBlocks"
import { RUNE_BLOCK_SPEC_METADATA, getBlockSpecs } from "../../schema"
import { buildClipboardSerializer } from "../../extensions/clipboard/serializer"
import { serializeBlocksForClipboard } from "../../extensions/clipboard/serializeBlocks"
import type { RuneColumnsBlock } from "./block"

// Build a doc JSON for a columnLayout with `n` columns, each holding one
// paragraph (with optional text).
function columnLayoutJSON(texts: string[][]) {
  return {
    type: "doc",
    content: [
      {
        type: "columnLayout",
        attrs: { id: "cl1", depth: 0 },
        content: texts.map((paras) => ({
          type: "column",
          attrs: { id: null, width: 1 },
          content: paras.map((t) => ({
            type: "paragraph",
            content: t ? [{ type: "text", text: t }] : undefined,
          })),
        })),
      },
    ],
  }
}

describe("columnLayout body block", () => {
  it("is a body block: has factory id/depth attrs, group block, __runeBlockSpec marker", () => {
    const editor = createTestEditor()
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "columnLayout",
    )
    expect(ext).toBeDefined()
    // factory marker on storage (the body-block discriminator).
    const storage = ext!.storage as { __runeBlockSpec?: boolean }
    expect(storage.__runeBlockSpec).toBe(true)
    // schema-level shape: group "block" with id/depth attrs.
    const type = editor.schema.nodes.columnLayout!
    expect(type.spec.group).toBe("block")
    expect(type.spec.attrs).toHaveProperty("id")
    expect(type.spec.attrs).toHaveProperty("depth")
  })

  it("is non-indentable (indent maxDepth 0)", () => {
    const editor = createTestEditor()
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "columnLayout",
    )
    const meta = (ext as unknown as Record<string, unknown>)[
      RUNE_BLOCK_SPEC_METADATA
    ] as { indent?: unknown }
    expect(meta.indent).toEqual({ mode: "numeric", maxDepth: 0 })
  })

  it("is included in BlockId scanned types; column is NOT", () => {
    const types = deriveBlockIdTypes(RUNE_BODY_BLOCKS)
    expect(types).toContain("columnLayout")
    expect(types).not.toContain("column")
  })

  it("enforces 2..5 columns at the schema level", () => {
    const editor = createTestEditor()
    const schema = editor.schema
    const layout = schema.nodes.columnLayout!
    const colNode = () =>
      schema.nodes.column!.create(
        { id: null, width: 1 },
        schema.nodes.paragraph!.create(),
      )
    const valid = (n: number) =>
      layout.validContent(Fragment.from(Array.from({ length: n }, colNode)))
    expect(valid(1)).toBe(false)
    expect(valid(2)).toBe(true)
    expect(valid(5)).toBe(true)
    expect(valid(6)).toBe(false)
  })

  it("getDocument returns the layout as ONE block; columns do not leak as blocks", () => {
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["A"], ["B"]]))
    const doc = getDocument(editor)
    const layouts = doc.filter((b) => b.type === "columnLayout")
    expect(layouts).toHaveLength(1)
    // No `column` ever appears as a top-level block.
    expect(doc.some((b) => (b as { type: string }).type === "column")).toBe(
      false,
    )
    // Projection carries the two columns under the single layout block.
    const layout = layouts[0] as { columns: unknown[] }
    expect(layout.columns).toHaveLength(2)
  })

  it("clipboard serialization degrades to a flat, chrome-free block sequence", () => {
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["Left"], ["Right"]]))
    editor.commands.selectAll()
    const slice = editor.state.selection.content()
    const host = editor.view.dom.ownerDocument.createElement("div")
    host.appendChild(
      buildClipboardSerializer(editor).serializeFragment(slice.content),
    )
    const html = host.innerHTML
    // Children survive, in document order.
    expect(html).toContain("Left")
    expect(html).toContain("Right")
    expect(html.indexOf("Left")).toBeLessThan(html.indexOf("Right"))
    // No layout chrome, no column chrome, no data-* attrs.
    expect(html).not.toContain("rune-columns")
    expect(html).not.toContain("rune-column")
    expect(html).not.toContain("data-col-id")
    expect(html).not.toContain("data-col-width")
    expect(html).not.toContain("data-id")
    expect(html).not.toContain("data-depth")
  })

  it("renderText joins column texts with blank lines", () => {
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["Left"], ["Right"]]))
    const node = editor.state.doc.firstChild!
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "columnLayout",
    )
    const renderText = (
      ext!.config as { renderText?: (a: { node: unknown }) => string }
    ).renderText
    // renderText is wired onto the Tiptap node config by the factory.
    expect(node.textContent).toContain("Left")
    // Verify via the node's own renderText if exposed; fall back to spec.
    if (typeof renderText === "function") {
      expect(renderText({ node })).toBe("Left\n\nRight")
    }
  })

  it("renderText separates blocks WITHIN a column with single newlines", () => {
    // PM textContent concatenates child textblocks with NO separator —
    // renderText must iterate the column's children itself, or two
    // paragraphs 'L one' / 'L two' read as 'L oneL two'.
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["L one", "L two"], ["Right"]]))
    const node = editor.state.doc.firstChild!
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "columnLayout",
    )
    const renderText = (
      ext!.config as { renderText?: (a: { node: unknown }) => string }
    ).renderText
    expect(typeof renderText).toBe("function")
    expect(renderText!({ node })).toBe("L one\nL two\n\nRight")
  })

  it("getText keeps a newline between a column's paragraphs", () => {
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["L one", "L two"], ["Right"]]))
    expect(editor.getText({ blockSeparator: "\n\n" })).toBe(
      "L one\nL two\n\nRight",
    )
  })

  it("clipboard text/plain separates ALL textblocks with blank lines (not renderText)", () => {
    // The copy path (writeClipboard → serializeBlocksForClipboard) builds
    // text/plain via PM's Fragment.textBetween, which applies text
    // serializers to LEAF nodes only — it descends into the non-leaf
    // layout and joins every textblock with the uniform "\n\n" separator,
    // exactly like root-level blocks. This deliberately differs from the
    // renderText / getText projection above (compact "\n" within a
    // column); the e2e twin lives in e2e/blocks/columns.spec.ts.
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["L one", "L two"], ["Right"]]))
    editor.commands.selectAllBlocks()
    const { text } = serializeBlocksForClipboard(editor.view)
    expect(text).toBe("L one\n\nL two\n\nRight")
  })

  it("toRuneBlock maps projectChild over each COLUMN's children (not the layout's direct children)", () => {
    const editor = createTestEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "columnLayout",
          attrs: { id: "cl1", depth: 0 },
          content: [
            {
              type: "column",
              attrs: { id: "colL", width: 2 },
              content: [{ type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "A" }] }],
            },
            {
              type: "column",
              attrs: { id: "colR", width: 1 },
              content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "B" }] }],
            },
          ],
        },
      ],
    })
    const layout = getDocument(editor)[0] as RuneColumnsBlock
    expect(layout.type).toBe("columnLayout")
    expect(layout.columns).toHaveLength(2)
    expect(layout.columns[0]!.id).toBe("colL")
    expect(layout.columns[0]!.width).toBe(2)
    // children are FULL projected body blocks (paragraphs), not column nodes.
    expect(layout.columns[0]!.children).toHaveLength(1)
    expect(layout.columns[0]!.children[0]!.type).toBe("paragraph")
    expect(layout.columns[0]!.children[0]!.id).toBe("L0")
    expect(layout.columns[1]!.children[0]!.id).toBe("R0")
  })

  it("ctx.projectChild(columnNode) returns null — columns are structural, not body blocks", () => {
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["A"], ["B"]]))
    const layoutNode = editor.state.doc.firstChild!
    const columnNode = layoutNode.firstChild!
    expect(columnNode.type.name).toBe("column")
    // blockFromNode IS ctx.projectChild — proving the layout must iterate
    // columns itself and project two levels down.
    expect(blockFromNode(editor, columnNode)).toBeNull()
  })

  it("getBlockById / findBlocks search recursively into column children", () => {
    const editor = createTestEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "root-a" }, content: [{ type: "text", text: "root" }] },
        {
          type: "columnLayout",
          attrs: { id: "cl1", depth: 0 },
          content: [
            {
              type: "column",
              attrs: { id: "colL", width: 1 },
              content: [{ type: "heading", attrs: { id: "deep", level: 2 }, content: [{ type: "text", text: "X" }] }],
            },
            {
              type: "column",
              attrs: { id: "colR", width: 1 },
              content: [{ type: "paragraph", attrs: { id: "deep2" }, content: [{ type: "text", text: "Y" }] }],
            },
          ],
        },
      ],
    })

    const deep = getBlockById(editor, "deep")
    expect(deep).not.toBeNull()
    expect(deep!.type).toBe("heading")

    const headings = findBlocks(editor, (b) => b.type === "heading")
    expect(headings.map((b) => b.id)).toEqual(["deep"])

    // root + nested both reachable.
    expect(getBlockById(editor, "root-a")).not.toBeNull()
    expect(getBlockById(editor, "deep2")).not.toBeNull()
  })

  it("JSON round-trip: project -> insertBlocks(projection) -> project is deep-equal", () => {
    const source = createTestEditor()
    source.commands.setContent({
      type: "doc",
      content: [
        {
          type: "columnLayout",
          attrs: { id: "cl1", depth: 0 },
          content: [
            {
              type: "column",
              attrs: { id: "colL", width: 2 },
              content: [
                { type: "heading", attrs: { id: "L0", level: 2 }, content: [{ type: "text", text: "Head" }] },
                { type: "paragraph", attrs: { id: "L1" }, content: [{ type: "text", text: "para" }] },
              ],
            },
            {
              type: "column",
              attrs: { id: "colR", width: 1 },
              content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
            },
          ],
        },
      ],
    })
    const projected = getDocument(source).find((b) => b.type === "columnLayout") as RuneColumnsBlock

    // Build a fresh editor with just a trailing paragraph, then insert the
    // projection as input. fromInput must rebuild columns + their children.
    const target = createTestEditor()
    target.commands.setContent([
      { type: "paragraph", content: [{ type: "text", text: "anchor" }] },
    ])
    const ok = target.commands.insertBlocks([projected], { at: "end" })
    expect(ok).toBe(true)

    const reProjected = getDocument(target).find((b) => b.type === "columnLayout") as RuneColumnsBlock
    expect(reProjected).toBeDefined()
    // Structural deep-equal (ids regenerated for the layout/columns by
    // BlockId / columns-normalization; compare type/width/children-shape).
    const shapeOf = (b: RuneColumnsBlock) => ({
      type: b.type,
      columns: b.columns.map((c) => ({
        width: c.width,
        children: c.children.map((child) => ({ type: child.type })),
      })),
    })
    expect(shapeOf(reProjected)).toEqual(shapeOf(projected))
  })

  it("fromInput rejects an out-of-range column count (1 or 6) instead of padding", () => {
    // A 1-column input must be REJECTED, not silently padded up to the
    // schema minimum (createAndFill alone would fabricate a 2nd column).
    const oneCol = createTestEditor()
    oneCol.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "x" }] }])
    const tooFew = oneCol.commands.insertBlocks(
      [
        {
          type: "columnLayout",
          columns: [{ id: "c1", width: 1, children: [{ type: "paragraph", text: "a" }] }],
        } as RuneColumnsBlock,
      ],
      { at: "end" },
    )
    expect(tooFew).toBe(false)
    expect(getDocument(oneCol).some((b) => b.type === "columnLayout")).toBe(false)

    // 6 columns is also rejected (createAndFill can't trim over the max).
    const sixCol = createTestEditor()
    sixCol.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "x" }] }])
    const tooMany = sixCol.commands.insertBlocks(
      [
        {
          type: "columnLayout",
          columns: Array.from({ length: 6 }, (_, i) => ({
            id: `c${i}`,
            width: 1,
            children: [{ type: "paragraph", text: "a" }],
          })),
        } as RuneColumnsBlock,
      ],
      { at: "end" },
    )
    expect(tooMany).toBe(false)
    expect(getDocument(sixCol).some((b) => b.type === "columnLayout")).toBe(false)
  })

  it("fromInput refuses (does not throw) a null / non-object child in a column", () => {
    const editor = createTestEditor()
    editor.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "x" }] }])
    let ok: boolean | undefined
    expect(() => {
      ok = editor.commands.insertBlocks(
        [
          {
            type: "columnLayout",
            columns: [
              { width: 1, children: [null] },
              { width: 1, children: [{ type: "paragraph", text: "b" }] },
            ],
          } as unknown as RuneColumnsBlock,
        ],
        { at: "end" },
      )
    }).not.toThrow()
    expect(ok).toBe(false)
    expect(getDocument(editor).some((b) => b.type === "columnLayout")).toBe(false)
  })

  it("fromInput rejects a nested columnLayout child instead of silently flattening it", () => {
    const editor = createTestEditor()
    editor.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "x" }] }])
    const ok = editor.commands.insertBlocks(
      [
        {
          type: "columnLayout",
          columns: [
            {
              width: 1,
              children: [
                {
                  type: "columnLayout",
                  columns: [
                    { width: 2, children: [{ type: "paragraph", text: "inner-a" }] },
                    { width: 3, children: [{ type: "paragraph", text: "inner-b" }] },
                  ],
                },
              ],
            },
            { width: 1, children: [{ type: "paragraph", text: "right" }] },
          ],
        } as unknown as RuneColumnsBlock,
      ],
      { at: "end" },
    )
    expect(ok).toBe(false)
    expect(getDocument(editor).some((b) => b.type === "columnLayout")).toBe(false)
  })

  it("fromInput rejects an array (non-plain-object) column entry instead of seeding a blank column", () => {
    const editor = createTestEditor()
    editor.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "x" }] }])
    const ok = editor.commands.insertBlocks(
      [
        {
          type: "columnLayout",
          columns: [
            ["not", "an", "object"],
            { width: 1, children: [{ type: "paragraph", text: "b" }] },
          ],
        } as unknown as RuneColumnsBlock,
      ],
      { at: "end" },
    )
    expect(ok).toBe(false)
    expect(getDocument(editor).some((b) => b.type === "columnLayout")).toBe(false)
  })

  it("HTML round-trip: setContent -> getHTML preserves a 2-column structure", () => {
    const editor = createTestEditor()
    editor.commands.setContent(columnLayoutJSON([["Hello"], ["World"]]))
    const html = editor.getHTML()
    expect(html).toContain("data-rune-columns")
    // two columns survive (match data-rune-column followed by a value/
    // close, so it doesn't also count the plural data-rune-columns).
    const colMatches = html.match(/data-rune-column(=|>| )/g) ?? []
    expect(colMatches.length).toBe(2)
    expect(html).toContain("Hello")
    expect(html).toContain("World")

    // Re-parse the emitted HTML and confirm the structure is identical.
    const editor2 = createTestEditor()
    editor2.commands.setContent(html)
    const layout = editor2.state.doc.firstChild!
    expect(layout.type.name).toBe("columnLayout")
    expect(layout.childCount).toBe(2)
    layout.forEach((col) => {
      expect(col.type.name).toBe("column")
      expect(col.firstChild?.type.name).toBe("paragraph")
    })
  })
})

describe("column width hygiene (review fix)", () => {
  it("toRuneBlock clamps NaN/negative stored widths to 1", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const col = (width: number) =>
      s.nodes.column!.create({ id: "c", width }, [s.nodes.paragraph!.create({ id: "p", depth: 0 })])
    // Node.create does not validate attrs — NaN/-1 can exist pre-normalization.
    const layout = s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [col(Number.NaN), col(-1)])
    const spec = getBlockSpecs(editor)["columnLayout"]!
    const projected = spec.toRuneBlock!(layout, {
      projectChild: () => null,
    }) as { columns: Array<{ width: number }> }
    expect(projected.columns.map((c) => c.width)).toEqual([1, 1])
  })

  it("fromInput clamps NaN/negative input widths to 1", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const ok = editor.commands.insertBlocks(
      [
        {
          type: "columnLayout",
          columns: [
            { width: Number.NaN, children: [] },
            { width: -1, children: [] },
          ],
        } as never,
      ],
      {},
    )
    expect(ok).toBe(true)
    let widths: number[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "column") widths.push(node.attrs.width as number)
      return true
    })
    expect(widths).toEqual([1, 1])
  })
})
