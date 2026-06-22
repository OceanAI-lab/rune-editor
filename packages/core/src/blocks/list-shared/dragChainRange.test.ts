// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { getBlockSpecs } from "../../schema"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { listChainDragRange } from "./dragChainRange"

const blocksFromJson = (
  editor: ReturnType<typeof createTestEditor>,
  items: ReadonlyArray<{ type: string; depth: number; text: string }>,
) => {
  editor.commands.setContent({
    type: "doc",
    content: items.map((b) => ({
      type: b.type,
      attrs: { depth: b.depth },
      content: b.text ? [{ type: "text", text: b.text }] : undefined,
    })),
  })
}

describe("listChainDragRange", () => {
  it("returns the single-block range when no deeper siblings follow", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 0, text: "one" },
      { type: "numberedList", depth: 0, text: "two" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 0, doc, editor })
    expect(range.from).toBe(0)
    expect(range.to).toBe(first.nodeSize)
  })

  it("extends to include trailing strictly-deeper siblings", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 0, text: "one" },
      { type: "numberedList", depth: 1, text: "two" },
      { type: "numberedList", depth: 2, text: "three" },
      { type: "numberedList", depth: 0, text: "four" },
    ])
    const doc = editor.state.doc
    const second = doc.child(1)
    const secondPos = doc.firstChild!.nodeSize
    const range = listChainDragRange({ node: second, pos: secondPos, doc, editor })
    expect(range.from).toBe(secondPos)
    expect(range.to).toBe(secondPos + second.nodeSize + doc.child(2).nodeSize)
  })

  it("stops at the first sibling whose depth equals self.depth", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 1, text: "a" },
      { type: "numberedList", depth: 2, text: "b" },
      { type: "numberedList", depth: 1, text: "c" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 0, doc, editor })
    expect(range.to).toBe(first.nodeSize + doc.child(1).nodeSize)
  })

  it("stops at a non-list sibling regardless of its depth attr", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 0, text: "one" },
      { type: "paragraph", depth: 0, text: "para" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 0, doc, editor })
    expect(range.to).toBe(first.nodeSize)
  })

  it("returns the single-block range when pos is not a top-level child boundary", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 0, text: "one" },
      { type: "numberedList", depth: 1, text: "two" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 1, doc, editor })
    expect(range.from).toBe(1)
    expect(range.to).toBe(1 + first.nodeSize)
  })

  it("extends across mixed structural list types", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 0, text: "one" },
      { type: "bulletList", depth: 1, text: "two" },
      { type: "taskList", depth: 2, text: "three" },
      { type: "paragraph", depth: 3, text: "para" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 0, doc, editor })
    expect(range.to).toBe(
      first.nodeSize + doc.child(1).nodeSize + doc.child(2).nodeSize,
    )
  })

  it("stops at the first shallower structural list sibling", () => {
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "numberedList", depth: 2, text: "one" },
      { type: "numberedList", depth: 3, text: "two" },
      { type: "numberedList", depth: 1, text: "three" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 0, doc, editor })
    expect(range.to).toBe(first.nodeSize + doc.child(1).nodeSize)
  })

  it("falls back to the hardcoded structural set when called editor-less", () => {
    // Pins FALLBACK_STRUCTURAL_TYPES as a genuine dead-code safety net:
    // the production path always threads `editor`, but the fallback must
    // still classify the built-in list types so a non-editor caller
    // extends across a trailing deeper bullet sibling.
    const editor = createTestEditor()
    blocksFromJson(editor, [
      { type: "bulletList", depth: 0, text: "parent" },
      { type: "bulletList", depth: 1, text: "child" },
      { type: "bulletList", depth: 0, text: "sibling" },
    ])
    const doc = editor.state.doc
    const first = doc.firstChild!
    const range = listChainDragRange({ node: first, pos: 0, doc })
    expect(range.to).toBe(first.nodeSize + doc.child(1).nodeSize)
  })
})

describe("listChainDragRange — in-column surfaces", () => {
  // Build doc: <p>root</p> + columnLayout(column(A d0, B d1, C d1), column(<p>D</p>)).
  // Returns A's absolute pos. Built via the schema directly — setContent JSON
  // shorthand only describes root blocks.
  const buildColumnDoc = (editor: ReturnType<typeof createTestEditor>) => {
    const s = editor.schema
    const bullet = (id: string, depth: number, t: string) =>
      s.nodes.bulletList!.create({ id, depth }, s.text(t))
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const doc = s.nodes.doc!.create(null, [
      para("r1", "root"),
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        s.nodes.column!.create({ id: "col_a", width: 1 }, [
          bullet("A", 0, "A"),
          bullet("B", 1, "B"),
          bullet("C", 1, "C"),
        ]),
        s.nodes.column!.create({ id: "col_b", width: 1 }, [para("d1", "D")]),
      ]),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )
    // A's pos: past <p>root</p>, the layout's open token, and col_a's open token.
    return editor.state.doc.child(0).nodeSize + 2
  }

  it("extends over trailing deeper siblings on a COLUMN surface", () => {
    // Regression pin: the old walk scanned only doc root children, so an
    // in-column chain head resolved selfIdx -1 and dragged ALONE — dropping
    // it outside the column orphaned its deeper children at a depth with no
    // parent (first column child at depth 1, nothing rebases it).
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const aPos = buildColumnDoc(editor)
    const doc = editor.state.doc
    const a = doc.nodeAt(aPos)!
    expect(a.attrs.id).toBe("A")
    const col = doc.child(1).child(0)
    const range = listChainDragRange({ node: a, pos: aPos, doc, editor })
    expect(range.from).toBe(aPos)
    expect(range.to).toBe(aPos + a.nodeSize + col.child(1).nodeSize + col.child(2).nodeSize)
  })

  it("the dragSourceRange hook (the drag pipeline's entry) sees the same in-column chain", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const aPos = buildColumnDoc(editor)
    const doc = editor.state.doc
    const a = doc.nodeAt(aPos)!
    const col = doc.child(1).child(0)
    const hook = getBlockSpecs(editor).bulletList!.dragSourceRange!
    const range = hook({ node: a, pos: aPos, doc, editor })
    expect(range.to).toBe(aPos + a.nodeSize + col.child(1).nodeSize + col.child(2).nodeSize)
  })

  it("still returns the single-block range for a pos off the surface's child boundaries", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const aPos = buildColumnDoc(editor)
    const doc = editor.state.doc
    const a = doc.nodeAt(aPos)!
    // aPos + 1 sits INSIDE A's text content — not a column-child boundary.
    const range = listChainDragRange({ node: a, pos: aPos + 1, doc, editor })
    expect(range).toEqual({ from: aPos + 1, to: aPos + 1 + a.nodeSize })
  })
})

describe.each(["numberedList", "bulletList", "taskList"] as const)(
  "%s dragSourceRange",
  (type) => {
    it("uses listChainDragRange to extend over trailing deeper siblings", () => {
      const editor = createTestEditor()
      blocksFromJson(editor, [
        { type, depth: 0, text: "parent" },
        { type, depth: 1, text: "child" },
        { type, depth: 0, text: "sibling" },
      ])
      const hook = getBlockSpecs(editor)[type]!.dragSourceRange!
      const doc = editor.state.doc
      const range = hook({ node: doc.firstChild!, pos: 0, doc })
      expect(range.to).toBe(doc.firstChild!.nodeSize + doc.child(1).nodeSize)
    })
  },
)
