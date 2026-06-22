// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { getDocument } from "../queries"
import type { RuneColumnsBlock } from "../../blocks/Columns/block"

// Task 2 — F2: a `moveBlocks` MOVE that empties the SOURCE column removes the
// column in the same transaction. When the layout drops below 2 columns the
// existing normalization unwrap dissolves it, splicing the survivor's children
// to the layout's ORIGINAL root position ("content stays put"). Contrast with
// `deleteBlocks`, which keeps E2's seeded empty paragraph — deleting content is
// NOT relocating it. This file pins the discriminator.

/** Root block ids in document order. */
function rootIds(editor: Editor): string[] {
  return getDocument(editor).map((b) => b.id)
}

function layoutOf(editor: Editor): RuneColumnsBlock | undefined {
  return getDocument(editor).find(
    (b): b is RuneColumnsBlock => b.type === "columnLayout",
  )
}

function columnChildIds(editor: Editor, columnId: string): string[] {
  const layout = layoutOf(editor)
  const column = layout?.columns.find((c) => c.id === columnId)
  return column ? column.children.map((c) => c.id) : []
}

/**
 * 2-column fixture:
 *   paragraph r1
 *   columnLayout lay
 *     column col_a: paragraph a1
 *     column col_b: paragraph b1
 *   paragraph r2
 */
function twoColFixture(): Editor {
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
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
  )
  return editor
}

/**
 * 3-column fixture:
 *   columnLayout lay
 *     column col_a: paragraph a1
 *     column col_b: paragraph b1
 *     column col_c: paragraph c1
 */
function threeColFixture(): Editor {
  const editor = createTestEditor({ kit: { suggestionMenus: false } })
  const s = editor.schema
  const para = (id: string, t: string) =>
    s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
  const col = (id: string, ...children: ProseMirrorNode[]) =>
    s.nodes.column!.create({ id, width: 1 }, children)
  const doc = s.nodes.doc!.create(null, [
    para("r0", "root-0"),
    s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
      col("col_a", para("a1", "A1")),
      col("col_b", para("b1", "B1")),
      col("col_c", para("c1", "C1")),
    ]),
  ])
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
  )
  return editor
}

describe("moveBlocks F2 — move-out empties a column", () => {
  it("2-col: moving a column's last block to root unwraps the layout, survivor stays put", () => {
    const editor = twoColFixture()
    // Move a1 (col_a's only block) to root after the layout.
    editor.commands.moveBlocks(["a1"], { id: "lay", side: "after" })

    // The layout dissolved: no columnLayout remains.
    expect(layoutOf(editor)).toBeUndefined()
    // "Content stays put": the survivor's content (b1) is at the layout's
    // original root slot (between r1 and the moved a1), then a1, then r2.
    expect(rootIds(editor)).toEqual(["r1", "b1", "a1", "r2"])
  })

  it("3-col: moving a column's last block out removes only that column; layout persists with 2 columns", () => {
    const editor = threeColFixture()
    // Move a1 (col_a's only block) to root after the layout.
    editor.commands.moveBlocks(["a1"], { id: "lay", side: "after" })

    const layout = layoutOf(editor)
    expect(layout).toBeDefined()
    // col_a removed; col_b + col_c persist.
    expect(layout!.columns.map((c) => c.id)).toEqual(["col_b", "col_c"])
    expect(columnChildIds(editor, "col_b")).toEqual(["b1"])
    expect(columnChildIds(editor, "col_c")).toEqual(["c1"])
    // a1 now sits at root after the layout.
    expect(rootIds(editor)).toContain("a1")
  })

  it("DISCRIMINATOR: deleteBlocks of the same block keeps the E2 empty paragraph (no unwrap)", () => {
    const editor = twoColFixture()
    editor.commands.deleteBlocks(["a1"])

    // Layout persists with two columns; col_a got an E2 placeholder paragraph.
    const layout = layoutOf(editor)
    expect(layout).toBeDefined()
    expect(layout!.columns.length).toBe(2)
    const colAChildren = columnChildIds(editor, "col_a")
    expect(colAChildren.length).toBe(1)
    expect(colAChildren).not.toContain("a1")
    // a1 is gone from the doc entirely (deleted, not relocated).
    expect(rootIds(editor)).not.toContain("a1")
  })

  it("moving ALL blocks of a multi-block column out empties + removes the column", () => {
    // Build col_a with two children; move both out together.
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const col = (id: string, ...children: ProseMirrorNode[]) =>
      s.nodes.column!.create({ id, width: 1 }, children)
    const doc = s.nodes.doc!.create(null, [
      para("r1", "root-1"),
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col("col_a", para("a1", "A1"), para("a2", "A2")),
        col("col_b", para("b1", "B1")),
      ]),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )

    editor.commands.moveBlocks(["a1", "a2"], { id: "lay", side: "after" })
    expect(layoutOf(editor)).toBeUndefined()
    // Survivor b1 stays at the layout slot; a1, a2 follow.
    expect(rootIds(editor)).toEqual(["r1", "b1", "a1", "a2"])
  })

  it("2-col: moving a column's last block INTO its sibling (unwrap) splices at the requested index", () => {
    // Regression (review finding #1): when the move both empties the source
    // column AND drops the layout below 2 columns (unwrap), and the destination
    // is INTERIOR to that same layout (into the surviving column), a plain
    // remove-then-insert maps the interior insert pos onto the unwrap's
    // whole-layout replaceWith boundary — collapsing the slice to the FRONT of
    // the spliced content regardless of the requested index. The atomic-splice
    // branch must honor the index.
    const editor = twoColFixture()
    // col_b = [b1]; move a1 (col_a's only block) to the END of col_b. col_a
    // empties → unwrap; expected root order is the survivor content THEN a1.
    editor.commands.moveBlocks(["a1"], { columnId: "col_b", at: "end" })
    expect(layoutOf(editor)).toBeUndefined()
    expect(rootIds(editor)).toEqual(["r1", "b1", "a1", "r2"])
  })

  it("2-col: moving a column's last block to the FRONT of its sibling (unwrap) lands before survivor content", () => {
    const editor = twoColFixture()
    // Move a1 to index 0 of col_b → before b1. After unwrap: a1 then b1.
    editor.commands.moveBlocks(["a1"], { columnId: "col_b", index: 0 })
    expect(layoutOf(editor)).toBeUndefined()
    expect(rootIds(editor)).toEqual(["r1", "a1", "b1", "r2"])
  })

  it("moving only ONE of a column's two blocks out does NOT remove the column", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const col = (id: string, ...children: ProseMirrorNode[]) =>
      s.nodes.column!.create({ id, width: 1 }, children)
    const doc = s.nodes.doc!.create(null, [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col("col_a", para("a1", "A1"), para("a2", "A2")),
        col("col_b", para("b1", "B1")),
      ]),
      para("r2", "root-2"),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )

    editor.commands.moveBlocks(["a1"], { id: "r2", side: "after" })
    const layout = layoutOf(editor)
    expect(layout).toBeDefined()
    expect(layout!.columns.length).toBe(2)
    // col_a keeps a2.
    expect(columnChildIds(editor, "col_a")).toEqual(["a2"])
  })
})

describe("moveBlocks — COL-6: drop-on-self is a successful no-op", () => {
  // executeMoveSlice returns null when the insert boundary lands inside
  // [source.from, source.to] (drop-on-self guard). This is a positionally no-op
  // move — the doc is ALREADY in the requested state. An idempotent no-op is a
  // SUCCESSFUL command (returns true, doc byte-identical). This is the same null
  // path that the D1 test in commands.test.ts pins ("re-bases relative to the
  // destination's preceding sibling") — moving "c" after its immediate predecessor
  // "b" when c is already there resolves to the identical insertPos===source.from
  // guard. The meaningful invariant is that the doc is unchanged, not the return
  // value direction (which was reverted from an incorrect COL-6 filing).

  it("drop-on-self (move block before itself) is a successful no-op — returns true, doc unchanged", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const doc = s.nodes.doc!.create(null, [
      para("p1", "one"),
      para("p2", "two"),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )
    const docBefore = editor.state.doc.toJSON()

    // Move p1 "before" itself — insertPos === source.from, drop-on-self guard
    // triggers; executeMoveSlice returns null. No-op success: returns true.
    const result = editor.commands.moveBlocks(["p1"], { id: "p1", side: "before" })
    expect(result).toBe(true)
    // The meaningful half: doc is byte-identical (no transaction dispatched).
    expect(editor.state.doc.toJSON()).toEqual(docBefore)
  })

  it("drop-on-self (move block after itself) is a successful no-op — returns true, doc unchanged", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const doc = s.nodes.doc!.create(null, [
      para("p1", "one"),
      para("p2", "two"),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )
    const docBefore = editor.state.doc.toJSON()

    // Move p1 "after" itself — insertPos === source.to (still inside the closed
    // [from, to] interval in executeMoveSlice). No-op success: returns true.
    const result = editor.commands.moveBlocks(["p1"], { id: "p1", side: "after" })
    expect(result).toBe(true)
    // The meaningful half: doc is byte-identical (no transaction dispatched).
    expect(editor.state.doc.toJSON()).toEqual(docBefore)
  })
})

describe("moveBlocks — root/intra-column moves stay behavior-identical", () => {
  it("normal root→root move reorders without touching any layout", () => {
    const editor = twoColFixture()
    // Move r2 before r1.
    editor.commands.moveBlocks(["r2"], { id: "r1", side: "before" })
    expect(rootIds(editor)).toEqual(["r2", "r1", "lay"])
    // Layout untouched.
    expect(columnChildIds(editor, "col_a")).toEqual(["a1"])
    expect(columnChildIds(editor, "col_b")).toEqual(["b1"])
  })

  it("intra-column reorder (2+ blocks) keeps the column and reorders", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    const s = editor.schema
    const para = (id: string, t: string) =>
      s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
    const col = (id: string, ...children: ProseMirrorNode[]) =>
      s.nodes.column!.create({ id, width: 1 }, children)
    const doc = s.nodes.doc!.create(null, [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col("col_a", para("a1", "A1"), para("a2", "A2")),
        col("col_b", para("b1", "B1")),
      ]),
    ])
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
    )

    editor.commands.moveBlocks(["a2"], { id: "a1", side: "before" })
    expect(columnChildIds(editor, "col_a")).toEqual(["a2", "a1"])
    // Still 2 columns.
    expect(layoutOf(editor)!.columns.length).toBe(2)
  })
})
