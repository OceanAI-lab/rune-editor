// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { getBlockById, getDocument } from "../queries"
import type { RuneColumnsBlock } from "../../blocks/Columns/block"

// Task 5 — column insert/move targets, surface-local depth.
//
// These exercise the public command surface (`insertBlocks`, `moveBlocks`,
// `deleteBlocks`, `updateBlock`, `turnInto`, `indentBlock`, `outdentBlock`)
// against a doc that contains a 2-column layout with body blocks inside the
// columns. The fixture is built straight from the schema so column ids are
// known up front (normalization backfills them, but we set them explicitly).

interface Fixture {
  editor: Editor
  /** The column ids in document order. */
  colA: string
  colB: string
}

/**
 * Doc shape:
 *   paragraph "root-1"  (id r1)
 *   columnLayout (id lay)
 *     column col_a: paragraph "A1" (a1)
 *     column col_b: paragraph "B1" (b1)
 *   paragraph "root-2"  (id r2)
 */
function makeFixture(): Fixture {
  const editor = createTestEditor({ kit: { suggestionMenus: false } })
  const s = editor.schema
  const para = (id: string, t: string) =>
    s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
  const col = (id: string, ...children: ProseMirrorNode[]) =>
    s.nodes.column!.create({ id, width: 1 }, children)
  const doc = s.nodes.doc!.create(null, [
    para("r1", "root-1"),
    s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
      col("col_a", para("a1", "A1")),
      col("col_b", para("b1", "B1")),
    ]),
    para("r2", "root-2"),
  ])
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content))
  return { editor, colA: "col_a", colB: "col_b" }
}

/** Project the layout block and read a column's child ids in order. */
function columnChildIds(editor: Editor, columnId: string): string[] {
  const layout = getDocument(editor).find(
    (b): b is RuneColumnsBlock => b.type === "columnLayout",
  )
  if (!layout) return []
  const column = layout.columns.find((c) => c.id === columnId)
  return column ? column.children.map((c) => c.id) : []
}

describe("insertBlocks — column target", () => {
  it("inserts at { columnId, index } within the column", () => {
    const { editor, colA } = makeFixture()
    editor.commands.insertBlocks(
      [{ type: "paragraph", id: "ins", text: "inserted" } as never],
      { at: { columnId: colA, index: 0 } },
    )
    expect(columnChildIds(editor, colA)).toEqual(["ins", "a1"])
  })

  it("inserts at { columnId, at: 'end' } at the column tail", () => {
    const { editor, colA } = makeFixture()
    editor.commands.insertBlocks(
      [{ type: "paragraph", id: "ins", text: "inserted" } as never],
      { at: { columnId: colA, at: "end" } },
    )
    expect(columnChildIds(editor, colA)).toEqual(["a1", "ins"])
  })

  it("rejects a columnLayout input targeted inside a column (no nesting)", () => {
    const { editor, colA } = makeFixture()
    const layoutInput = {
      type: "columnLayout",
      columns: [
        { id: "x", width: 1, children: [] },
        { id: "y", width: 1, children: [] },
      ],
    } as never
    const ok = editor.commands.insertBlocks([layoutInput], {
      at: { columnId: colA, index: 0 },
    })
    expect(ok).toBe(false)
    // Column A unchanged.
    expect(columnChildIds(editor, colA)).toEqual(["a1"])
  })

  it("returns false for an unknown columnId", () => {
    const { editor } = makeFixture()
    const ok = editor.commands.insertBlocks(
      [{ type: "paragraph", id: "ins", text: "x" } as never],
      { at: { columnId: "col_missing", index: 0 } },
    )
    expect(ok).toBe(false)
  })
})

describe("moveBlocks — column targets and cross-surface", () => {
  it("moves a root block into a column (root → column)", () => {
    const { editor, colA } = makeFixture()
    editor.commands.moveBlocks(["r1"], { columnId: colA, at: "end" })
    expect(columnChildIds(editor, colA)).toEqual(["a1", "r1"])
    // No longer at root.
    expect(getDocument(editor).map((b) => b.id)).not.toContain("r1")
  })

  it("moves a column child to root (column → root)", () => {
    const { editor } = makeFixture()
    // Move a1 to after the layout at root via a root target.
    editor.commands.moveBlocks(["a1"], { id: "lay", side: "after" })
    expect(getDocument(editor).map((b) => b.id)).toContain("a1")
  })

  it("moves a block column → column", () => {
    const { editor, colA, colB } = makeFixture()
    // F2 note: moving a column's LAST block out now empties + removes the
    // source column (and unwraps the layout if <2 columns remain). To exercise
    // a plain column→column move without tripping F2, give col_a a second child
    // so col_a survives the move.
    editor.commands.insertBlocks(
      [{ type: "paragraph", id: "a2", text: "A2" } as never],
      { at: { columnId: colA, at: "end" } },
    )
    editor.commands.moveBlocks(["a1"], { columnId: colB, at: "end" })
    expect(columnChildIds(editor, colB)).toEqual(["b1", "a1"])
    // col_a kept a2 (not emptied, not removed).
    expect(columnChildIds(editor, colA)).toEqual(["a2"])
  })

  it("intra-column reorder lands a text caret in the column, not a whole-layout selection", () => {
    const { editor, colA } = makeFixture()
    // Give col_a a second child so there is something to reorder within it.
    editor.commands.insertBlocks(
      [{ type: "paragraph", id: "a2", text: "A2" } as never],
      { at: { columnId: colA, at: "end" } },
    )
    expect(columnChildIds(editor, colA)).toEqual(["a1", "a2"])

    // Same-surface (intra-column) move: a2 before a1. The structural move is
    // correct either way; the regression is the SELECTION — a same-surface
    // non-root move must NOT take the MBS restore path (root `.index(0)`),
    // which would select the entire columnLayout.
    const ok = editor.commands.moveBlocks(["a2"], { id: "a1", side: "before" })
    expect(ok).toBe(true)
    expect(columnChildIds(editor, colA)).toEqual(["a2", "a1"])

    const sel = editor.state.selection
    expect(sel instanceof TextSelection).toBe(true)
    // The caret sits inside the column, not spanning the layout from root.
    let insideColumn = false
    for (let d = sel.$head.depth; d > 0; d--) {
      if (sel.$head.node(d).type.name === "column") {
        insideColumn = true
        break
      }
    }
    expect(insideColumn).toBe(true)
  })
})

describe("moveBlocks / deleteBlocks — range + cross-surface guards", () => {
  it("deleteBlocks range across surfaces is rejected (return false)", () => {
    const { editor } = makeFixture()
    // r1 (root) → a1 (column) is a cross-surface range.
    const ok = editor.commands.deleteBlocks({ from: "r1", to: "a1" })
    expect(ok).toBe(false)
    // Doc untouched.
    expect(getDocument(editor).map((b) => b.id)).toEqual(["r1", "lay", "r2"])
  })

  it("turnInto range across surfaces is rejected (return false)", () => {
    const { editor } = makeFixture()
    const ok = editor.commands.turnInto(
      { from: "r1", to: "a1" },
      { type: "heading", props: { level: 2 } } as never,
    )
    expect(ok).toBe(false)
  })

  it("moveBlocks of a cross-surface (non-contiguous) source is rejected", () => {
    const { editor, colA } = makeFixture()
    // r1 (root) + a1 (column) cannot move together — different surfaces.
    const ok = editor.commands.moveBlocks(["r1", "a1"], {
      columnId: colA,
      at: "end",
    })
    expect(ok).toBe(false)
  })

  it("deleteBlocks of a column's last block leaves the E2 paragraph", () => {
    const { editor, colA } = makeFixture()
    editor.commands.deleteBlocks(["a1"])
    // Normalization backfills an empty paragraph so the column is non-empty.
    const ids = columnChildIds(editor, colA)
    expect(ids.length).toBe(1)
    expect(ids).not.toContain("a1")
    // The layout still has exactly two columns (no unwrap).
    const layout = getDocument(editor).find(
      (b): b is RuneColumnsBlock => b.type === "columnLayout",
    )
    expect(layout?.columns.length).toBe(2)
  })
})

describe("moveBlocks — no-nesting guard (COL-1)", () => {
  /**
   * Two sibling layouts:
   *   paragraph r1
   *   columnLayout lay1
   *     column col_a: paragraph a1
   *     column col_b: paragraph b1
   *   columnLayout lay2
   *     column col_c: paragraph c1
   *     column col_d: paragraph d1
   *   paragraph r2
   */
  function twoLayoutFixture(): Editor {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const col = (id: string, ...children: ProseMirrorNode[]) =>
      s.nodes.column!.create({ id, width: 1 }, children)
    const doc = s.nodes.doc!.create(null, [
      para("r1", "root-1"),
      s.nodes.columnLayout!.create({ id: "lay1", depth: 0 }, [
        col("col_a", para("a1", "A1")),
        col("col_b", para("b1", "B1")),
      ]),
      s.nodes.columnLayout!.create({ id: "lay2", depth: 0 }, [
        col("col_c", para("c1", "C1")),
        col("col_d", para("d1", "D1")),
      ]),
      para("r2", "root-2"),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )
    return editor
  }

  it("refuses to move a columnLayout into a column target (returns false, doc unchanged)", () => {
    const editor = twoLayoutFixture()
    const before = editor.state.doc.toJSON()

    const ok = editor.commands.moveBlocks(["lay2"], { columnId: "col_a", at: "end" })

    expect(ok).toBe(false)
    // lay2 intact, NOT flattened into col_a (the normalization safety-net must
    // not be the command contract).
    expect(editor.state.doc.toJSON()).toEqual(before)
    expect(columnChildIds(editor, "col_a")).toEqual(["a1"])
    expect(getDocument(editor).map((b) => b.id)).toEqual(["r1", "lay1", "lay2", "r2"])
  })

  it("refuses a sibling target INSIDE a column for a layout run", () => {
    const editor = twoLayoutFixture()
    const before = editor.state.doc.toJSON()

    // Destination surface is col_a (sibling target a1), source run is a layout.
    const ok = editor.commands.moveBlocks(["lay2"], { id: "a1", side: "after" })

    expect(ok).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("refuses a multi-block run CONTAINING a layout into a column target", () => {
    const editor = twoLayoutFixture()
    const before = editor.state.doc.toJSON()

    // Contiguous root run [lay2, r2] contains a columnLayout.
    const ok = editor.commands.moveBlocks(["lay2", "r2"], {
      columnId: "col_b",
      at: "end",
    })

    expect(ok).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("still moves a layout to a ROOT target (guard only fires on non-root destinations)", () => {
    const editor = twoLayoutFixture()
    const ok = editor.commands.moveBlocks(["lay2"], { id: "r1", side: "before" })
    expect(ok).toBe(true)
    expect(getDocument(editor).map((b) => b.id)).toEqual(["lay2", "r1", "lay1", "r2"])
  })
})

describe("updateBlock / turnInto on a column child (resolver-only)", () => {
  it("updateBlock edits a column child without a column-specific code path", () => {
    const { editor, colA } = makeFixture()
    const ok = editor.commands.updateBlock("a1", { text: "edited" } as never)
    expect(ok).toBe(true)
    const block = getBlockById(editor, "a1") as { text?: string } | null
    expect(block?.text).toBe("edited")
    // Still inside the column.
    expect(columnChildIds(editor, colA)).toEqual(["a1"])
  })

  it("turnInto converts a column child", () => {
    const { editor, colA } = makeFixture()
    const ok = editor.commands.turnInto("a1", {
      type: "heading",
      props: { level: 2 },
    } as never)
    expect(ok).toBe(true)
    const block = getBlockById(editor, "a1")
    expect(block?.type).toBe("heading")
    expect(columnChildIds(editor, colA)).toEqual(["a1"])
  })
})

describe("indent / outdent inside a column (surface-local depth)", () => {
  /**
   * Column A holds two paragraphs: a1 (depth 0), a2 (depth 0). Indenting a2
   * caps at COLUMN-LOCAL predecessor a1 (depth 0) + 1 = 1. a1 (first in
   * column) cannot indent past 0.
   */
  function twoChildColumn(): { editor: Editor } {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const doc = s.nodes.doc!.create(null, [
      para("r1", "root-1"),
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        s.nodes.column!.create({ id: "col_a", width: 1 }, [
          para("a1", "A1"),
          para("a2", "A2"),
        ]),
        s.nodes.column!.create({ id: "col_b", width: 1 }, [para("b1", "B1")]),
      ]),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )
    return { editor }
  }

  function depthOf(editor: Editor, id: string): number {
    let d = -1
    editor.state.doc.descendants((node) => {
      if (node.attrs.id === id) d = node.attrs.depth as number
      return true
    })
    return d
  }

  function posInside(editor: Editor, id: string): number {
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (node.attrs.id === id) pos = p + 1
      return true
    })
    return pos
  }

  it("indents a second column child against its column-local predecessor", () => {
    const { editor } = twoChildColumn()
    const tr = editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, posInside(editor, "a2")),
    )
    editor.view.dispatch(tr)
    editor.commands.indentBlock()
    expect(depthOf(editor, "a2")).toBe(1)
  })

  it("does not indent a column's first child past depth 0", () => {
    const { editor } = twoChildColumn()
    const tr = editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, posInside(editor, "a1")),
    )
    editor.view.dispatch(tr)
    editor.commands.indentBlock()
    expect(depthOf(editor, "a1")).toBe(0)
  })

  it("outdents a column child back to the column 0 floor", () => {
    const { editor } = twoChildColumn()
    // First indent a2 to depth 1.
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, posInside(editor, "a2")),
      ),
    )
    editor.commands.indentBlock()
    expect(depthOf(editor, "a2")).toBe(1)
    // Then outdent back to 0.
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, posInside(editor, "a2")),
      ),
    )
    editor.commands.outdentBlock()
    expect(depthOf(editor, "a2")).toBe(0)
  })
})

describe("review fixes — overlapping deletes and column-target depth clamp", () => {
  it("deleteBlocks drops ranges contained in another range (layout + nested child)", () => {
    const { editor } = makeFixture()
    // findBlocks-style input: a layout AND a block nested inside it. The
    // nested range is fully contained — deleting both via stale pre-tr
    // positions must not eat into the next root block.
    const ok = editor.commands.deleteBlocks(["lay", "a1"])
    expect(ok).toBe(true)
    expect(getDocument(editor).map((b) => b.id)).toEqual(["r1", "r2"])
    expect(editor.state.doc.textContent).toBe("root-1root-2")
  })

  it("insertBlocks clamps an oversized depth at a column target", () => {
    const { editor, colA } = makeFixture()
    editor.commands.insertBlocks(
      [{ type: "paragraph", id: "ins", text: "deep" } as never],
      { at: { columnId: colA, index: 0 }, depth: 5 },
    )
    expect(columnChildIds(editor, colA)).toEqual(["ins", "a1"])
    // No column-local predecessor → clamp to 0. (The nodesBetween walk must
    // descend through the enclosing layout/column, not prune at them.)
    let depth = -1
    editor.state.doc.descendants((node) => {
      if (node.attrs.id === "ins") depth = node.attrs.depth as number
      return true
    })
    expect(depth).toBe(0)
  })
})
