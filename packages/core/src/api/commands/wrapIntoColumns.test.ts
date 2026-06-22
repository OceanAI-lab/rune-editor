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
import { applyWrapIntoColumns, resolveWrapIntoColumns } from "./wrapIntoColumns"

// Task 7 (F6) — `wrapIntoColumns`: the drag-to-create-columns command
// primitive. Two target shapes:
//   - `{ id, side }`  — wrap a ROOT target block + the dragged run into a NEW
//     2-column layout (both columns width 1). Drop side = dragged-block side:
//     side "left" puts the dragged run in the LEFT column.
//   - `{ layoutId, index }` — insert a NEW column at that boundary of an
//     existing layout; new column width = MEAN of the existing column widths;
//     the dragged run becomes its children. Refused at the 5-column cap.
// One transaction (one undo step); F2 emptied-source-column removal composes.

function rootBlocks(editor: Editor) {
  return getDocument(editor)
}

function rootIds(editor: Editor): string[] {
  return rootBlocks(editor).map((b) => b.id)
}

function layoutsOf(editor: Editor): RuneColumnsBlock[] {
  return rootBlocks(editor).filter(
    (b): b is RuneColumnsBlock => b.type === "columnLayout",
  )
}

function makeEditor(build: (s: Editor["schema"]) => ProseMirrorNode[]): Editor {
  const editor = createTestEditor({ kit: { suggestionMenus: false } })
  const s = editor.schema
  const doc = s.nodes.doc!.create(null, build(s))
  // Fixture setup stays OUT of history: prosemirror-history would otherwise
  // group it with a command dispatched milliseconds later (newGroupDelay) and
  // the one-undo-step assertions would undo the fixture too.
  editor.view.dispatch(
    editor.state.tr
      .replaceWith(0, editor.state.doc.content.size, doc.content)
      .setMeta("addToHistory", false),
  )
  return editor
}

const para = (s: Editor["schema"], id: string, t: string, depth = 0) =>
  s.nodes.paragraph!.create({ id, depth }, s.text(t))
const col = (
  s: Editor["schema"],
  id: string,
  width: number,
  ...children: ProseMirrorNode[]
) => s.nodes.column!.create({ id, width }, children)

/** [A, B, C] flat root paragraphs. */
function flatEditor(): Editor {
  return makeEditor((s) => [
    para(s, "A", "alpha"),
    para(s, "B", "beta"),
    para(s, "C", "gamma"),
  ])
}

/** r1, 2-col layout (col_a:[a1], col_b:[b1]), r2. */
function twoColEditor(widths: [number, number] = [1, 1]): Editor {
  return makeEditor((s) => [
    para(s, "r1", "root-1"),
    s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
      col(s, "col_a", widths[0], para(s, "a1", "A1")),
      col(s, "col_b", widths[1], para(s, "b1", "B1")),
    ]),
    para(s, "r2", "root-2"),
  ])
}

describe("wrapIntoColumns — { id, side } (wrap a root block)", () => {
  it("right-edge drop: dragged run becomes the RIGHT column; both widths 1", () => {
    const editor = flatEditor()
    expect(editor.commands.wrapIntoColumns(["C"], { id: "A", side: "right" })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout).toBeDefined()
    expect(layout!.columns.length).toBe(2)
    expect(layout!.columns[0]!.children.map((c) => c.id)).toEqual(["A"])
    expect(layout!.columns[1]!.children.map((c) => c.id)).toEqual(["C"])
    expect(layout!.columns.map((c) => c.width)).toEqual([1, 1])
    // C left the root surface; the layout sits at A's old slot.
    expect(rootIds(editor)).toEqual([layout!.id, "B"])
  })

  it("left-edge drop: dragged run becomes the LEFT column (drop side = dragged side)", () => {
    const editor = flatEditor()
    expect(editor.commands.wrapIntoColumns(["C"], { id: "A", side: "left" })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns[0]!.children.map((c) => c.id)).toEqual(["C"])
    expect(layout!.columns[1]!.children.map((c) => c.id)).toEqual(["A"])
  })

  it("a contiguous multi-block run becomes the new column's children, in order", () => {
    const editor = flatEditor()
    expect(editor.commands.wrapIntoColumns(["B", "C"], { id: "A", side: "right" })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns[1]!.children.map((c) => c.id)).toEqual(["B", "C"])
  })

  it("re-bases the dragged run's depth to the new column surface (first block → 0)", () => {
    // B/C are X's children (NOT the target A's — a run inside the target's
    // own subtree is refused); their depths re-base relative to the run head.
    const editor = makeEditor((s) => [
      para(s, "A", "alpha"),
      para(s, "X", "ex"),
      para(s, "B", "beta", 1),
      para(s, "C", "gamma", 2),
    ])
    expect(editor.commands.wrapIntoColumns(["B", "C"], { id: "A", side: "right" })).toBe(true)

    const [layout] = layoutsOf(editor)
    const dragged = layout!.columns[1]!.children
    expect(dragged.map((c) => c.depth)).toEqual([0, 1])
  })

  it("one undo step restores the original document", () => {
    const editor = flatEditor()
    const before = editor.state.doc.toJSON()
    editor.commands.wrapIntoColumns(["C"], { id: "A", side: "right" })
    expect(layoutsOf(editor).length).toBe(1)
    editor.commands.undo()
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("F2 composes: wrapping a column's LAST block elsewhere unwraps the source layout in the SAME tr", () => {
    const editor = twoColEditor()
    const before = editor.state.doc.toJSON()
    // a1 is col_a's only block; wrap it onto r2's right edge.
    expect(editor.commands.wrapIntoColumns(["a1"], { id: "r2", side: "right" })).toBe(true)

    // Old layout unwrapped: survivor b1 splices to the layout's root slot.
    const layouts = layoutsOf(editor)
    expect(layouts.length).toBe(1)
    const ids = rootIds(editor)
    expect(ids[0]).toBe("r1")
    expect(ids[1]).toBe("b1")
    // The new layout wraps r2 (left) + a1 (right).
    expect(layouts[0]!.columns[0]!.children.map((c) => c.id)).toEqual(["r2"])
    expect(layouts[0]!.columns[1]!.children.map((c) => c.id)).toEqual(["a1"])

    // ONE undo step restores everything (unwrap + wrap were one tr).
    editor.commands.undo()
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("wrapping a target with indented children moves the WHOLE target subtree into its column", () => {
    // parent's flat-depth descendants (consecutive following root siblings
    // with depth > parent's) must move into the target column WITH it —
    // wrapping the parent alone would orphan them at root, below the new
    // layout, with a dangling depth.
    const editor = makeEditor((s) => [
      para(s, "parent", "parent"),
      para(s, "child", "child", 1),
      para(s, "grand", "grandchild", 2),
      para(s, "drag", "dragged"),
    ])
    expect(
      editor.commands.wrapIntoColumns(["drag"], { id: "parent", side: "right" }),
    ).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout).toBeDefined()
    expect(layout!.columns[0]!.children.map((c) => c.id)).toEqual([
      "parent",
      "child",
      "grand",
    ])
    expect(layout!.columns[0]!.children.map((c) => c.depth)).toEqual([0, 1, 2])
    expect(layout!.columns[1]!.children.map((c) => c.id)).toEqual(["drag"])
    // Nothing left dangling at root below the layout.
    expect(rootIds(editor)).toEqual([layout!.id])
  })

  it("re-bases the target subtree's depth to the new column surface (first block → 0)", () => {
    // Target at depth 1 with a depth-2 child: the column is a fresh surface,
    // so the subtree lands at [0, 1] — same rebase rule as the dragged run.
    const editor = makeEditor((s) => [
      para(s, "top", "top"),
      para(s, "T", "target", 1),
      para(s, "TC", "target-child", 2),
      para(s, "drag", "dragged"),
    ])
    expect(editor.commands.wrapIntoColumns(["drag"], { id: "T", side: "right" })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns[0]!.children.map((c) => c.id)).toEqual(["T", "TC"])
    expect(layout!.columns[0]!.children.map((c) => c.depth)).toEqual([0, 1])
    expect(rootIds(editor)).toEqual(["top", layout!.id])
  })

  it("refuses when the dragged run lies inside the target's subtree (child onto its own parent's edge)", () => {
    const editor = makeEditor((s) => [
      para(s, "parent", "parent"),
      para(s, "child", "child", 1),
      para(s, "other", "other"),
    ])
    const before = editor.state.doc.toJSON()
    expect(
      editor.commands.wrapIntoColumns(["child"], { id: "parent", side: "right" }),
    ).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("refuses a self-wrap (dragged run includes the target)", () => {
    const editor = flatEditor()
    const before = editor.state.doc.toJSON()
    expect(editor.commands.wrapIntoColumns(["A"], { id: "A", side: "right" })).toBe(false)
    expect(editor.commands.wrapIntoColumns(["A", "B"], { id: "B", side: "left" })).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("refuses a target INSIDE a column (wrapping would nest layouts)", () => {
    const editor = twoColEditor()
    expect(editor.commands.wrapIntoColumns(["r2"], { id: "a1", side: "right" })).toBe(false)
  })

  it("refuses when the dragged run contains a columnLayout (no nesting)", () => {
    const editor = twoColEditor()
    expect(editor.commands.wrapIntoColumns(["lay"], { id: "r1", side: "right" })).toBe(false)
    expect(
      editor.commands.wrapIntoColumns(["r1", "lay"], { id: "r2", side: "right" }),
    ).toBe(false)
  })

  it("refuses a columnLayout as the wrap target (use { layoutId } instead)", () => {
    const editor = twoColEditor()
    expect(editor.commands.wrapIntoColumns(["r1"], { id: "lay", side: "right" })).toBe(false)
  })

  it("refuses unknown ids and non-contiguous runs", () => {
    const editor = flatEditor()
    expect(editor.commands.wrapIntoColumns(["nope"], { id: "A", side: "right" })).toBe(false)
    expect(editor.commands.wrapIntoColumns(["A", "C"], { id: "B", side: "right" })).toBe(false)
    expect(editor.commands.wrapIntoColumns([], { id: "A", side: "right" })).toBe(false)
  })
})

describe("wrapIntoColumns — { layoutId, index } (add a column)", () => {
  it("inserts a new column between the two columns; width = mean of existing", () => {
    const editor = twoColEditor()
    expect(editor.commands.wrapIntoColumns(["r2"], { layoutId: "lay", index: 1 })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns.length).toBe(3)
    expect(layout!.columns[0]!.id).toBe("col_a")
    expect(layout!.columns[1]!.children.map((c) => c.id)).toEqual(["r2"])
    expect(layout!.columns[2]!.id).toBe("col_b")
    // Mean of [1, 1] = 1 → equal thirds under the ratio model.
    expect(layout!.columns.map((c) => c.width)).toEqual([1, 1, 1])
    expect(rootIds(editor)).toEqual(["r1", layout!.id])
  })

  it("new column width is the MEAN of unequal existing widths", () => {
    const editor = twoColEditor([1, 2])
    expect(editor.commands.wrapIntoColumns(["r2"], { layoutId: "lay", index: 2 })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns.map((c) => c.width)).toEqual([1, 2, 1.5])
  })

  it("a non-terminating mean is rounded to RATIO_DECIMALS (resize-commit precision)", () => {
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col(s, "c1", 1, para(s, "p1", "1")),
        col(s, "c2", 1, para(s, "p2", "2")),
        col(s, "c3", 1.5, para(s, "p3", "3")),
      ]),
      para(s, "r1", "root-1"),
    ])
    expect(editor.commands.wrapIntoColumns(["r1"], { layoutId: "lay", index: 3 })).toBe(true)
    // Mean of [1, 1, 1.5] = 1.16666… → stored as 1.1667, matching the 4-decimal
    // precision resizeColumnPair commits.
    expect(layoutsOf(editor)[0]!.columns.map((c) => c.width)).toEqual([1, 1, 1.5, 1.1667])
  })

  it("boundary index 0 inserts at the left outer edge; index = columnCount at the right", () => {
    const left = twoColEditor()
    left.commands.wrapIntoColumns(["r1"], { layoutId: "lay", index: 0 })
    expect(layoutsOf(left)[0]!.columns[0]!.children.map((c) => c.id)).toEqual(["r1"])

    const right = twoColEditor()
    right.commands.wrapIntoColumns(["r1"], { layoutId: "lay", index: 2 })
    expect(layoutsOf(right)[0]!.columns[2]!.children.map((c) => c.id)).toEqual(["r1"])
  })

  it("a multi-block run becomes the new column's children", () => {
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col(s, "col_a", 1, para(s, "a1", "A1")),
        col(s, "col_b", 1, para(s, "b1", "B1")),
      ]),
      para(s, "r1", "root-1"),
      para(s, "r2", "root-2"),
    ])
    expect(
      editor.commands.wrapIntoColumns(["r1", "r2"], { layoutId: "lay", index: 1 }),
    ).toBe(true)
    const [layout] = layoutsOf(editor)
    expect(layout!.columns[1]!.children.map((c) => c.id)).toEqual(["r1", "r2"])
  })

  it("refuses at the 5-column cap (no dead drop)", () => {
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col(s, "c1", 1, para(s, "p1", "1")),
        col(s, "c2", 1, para(s, "p2", "2")),
        col(s, "c3", 1, para(s, "p3", "3")),
        col(s, "c4", 1, para(s, "p4", "4")),
        col(s, "c5", 1, para(s, "p5", "5")),
      ]),
      para(s, "r1", "root-1"),
    ])
    expect(editor.commands.wrapIntoColumns(["r1"], { layoutId: "lay", index: 5 })).toBe(false)
    expect(layoutsOf(editor)[0]!.columns.length).toBe(5)
  })

  it("moving a block from ANOTHER column into a boundary keeps both columns (non-emptying)", () => {
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col(s, "col_a", 1, para(s, "a1", "A1"), para(s, "a2", "A2")),
        col(s, "col_b", 1, para(s, "b1", "B1")),
      ]),
    ])
    expect(editor.commands.wrapIntoColumns(["a2"], { layoutId: "lay", index: 2 })).toBe(true)
    const [layout] = layoutsOf(editor)
    expect(layout!.columns.map((c) => c.children.map((ch) => ch.id))).toEqual([
      ["a1"],
      ["b1"],
      ["a2"],
    ])
  })

  it("dragging a column's ONLY block to a boundary of the SAME layout removes the emptied column, no unwrap", () => {
    const editor = twoColEditor()
    // a1 is col_a's only block → col_a empties; the new column replaces it on
    // the other side. Net column count stays 2; the layout survives.
    expect(editor.commands.wrapIntoColumns(["a1"], { layoutId: "lay", index: 2 })).toBe(true)

    const layouts = layoutsOf(editor)
    expect(layouts.length).toBe(1)
    const cols = layouts[0]!.columns
    expect(cols.length).toBe(2)
    expect(cols[0]!.id).toBe("col_b")
    expect(cols[1]!.children.map((c) => c.id)).toEqual(["a1"])
  })

  it("same-layout emptying move: new column width = mean of the SURVIVING columns", () => {
    // col_a width 1.5, col_b width 0.5; b1 is col_b's only block → col_b
    // empties and drops out. The new column's share must come from the
    // SURVIVORS (mean of [1.5] = 1.5 → an equal 50/50 split with col_a), not
    // from all original columns (mean of [1.5, 0.5] = 1 → a 40/60 skew).
    const editor = twoColEditor([1.5, 0.5])
    expect(editor.commands.wrapIntoColumns(["b1"], { layoutId: "lay", index: 0 })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns.map((c) => c.children.map((ch) => ch.id))).toEqual([
      ["b1"],
      ["a1"],
    ])
    expect(layout!.columns.map((c) => c.width)).toEqual([1.5, 1.5])
  })

  it("same-layout NON-emptying move: all columns survive, so the mean covers all of them", () => {
    // a2 leaves col_a but a1 stays → both originals survive; the new column's
    // width is the mean of [1.5, 0.5] = 1 (identical to the historical
    // all-columns mean — pins the non-emptying path's numbers).
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
        col(s, "col_a", 1.5, para(s, "a1", "A1"), para(s, "a2", "A2")),
        col(s, "col_b", 0.5, para(s, "b1", "B1")),
      ]),
    ])
    expect(editor.commands.wrapIntoColumns(["a2"], { layoutId: "lay", index: 2 })).toBe(true)

    const [layout] = layoutsOf(editor)
    expect(layout!.columns.map((c) => c.children.map((ch) => ch.id))).toEqual([
      ["a1"],
      ["b1"],
      ["a2"],
    ])
    expect(layout!.columns.map((c) => c.width)).toEqual([1.5, 0.5, 1])
  })

  it("F2 composes across layouts: last block out of layout X into layout Y's boundary unwraps X", () => {
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "layX", depth: 0 }, [
        col(s, "x_a", 1, para(s, "xa1", "XA1")),
        col(s, "x_b", 1, para(s, "xb1", "XB1")),
      ]),
      s.nodes.columnLayout!.create({ id: "layY", depth: 0 }, [
        col(s, "y_a", 1, para(s, "ya1", "YA1")),
        col(s, "y_b", 1, para(s, "yb1", "YB1")),
      ]),
    ])
    const before = editor.state.doc.toJSON()
    expect(editor.commands.wrapIntoColumns(["xa1"], { layoutId: "layY", index: 0 })).toBe(true)

    // X unwrapped (survivor xb1 at X's slot); Y gained a column.
    const layouts = layoutsOf(editor)
    expect(layouts.length).toBe(1)
    expect(layouts[0]!.id).toBe("layY")
    expect(layouts[0]!.columns.length).toBe(3)
    expect(layouts[0]!.columns[0]!.children.map((c) => c.id)).toEqual(["xa1"])
    expect(rootIds(editor)).toEqual(["xb1", "layY"])

    // One undo step restores everything.
    editor.commands.undo()
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("post-removal identity recheck failure sets preventDispatch (wrap shape)", () => {
    // The recheck is unreachable through resolveWrapIntoColumns today (the
    // reviewer could not construct a firing case either) — doctor the resolved
    // payload to simulate a post-mapping identity mismatch. The tr has already
    // run removeMoveSource at that point, so WITHOUT the meta Tiptap's
    // CommandManager would dispatch the shared tr even though the command
    // returned false → the dragged run silently deleted, no layout created.
    const editor = flatEditor()
    const resolved = resolveWrapIntoColumns(editor.state.doc, ["C"], {
      id: "A",
      side: "right",
    })
    expect(resolved).not.toBeNull()
    expect(resolved!.kind).toBe("wrap")
    const doctored = { ...resolved!, targetId: "bogus" } as typeof resolved & object
    const tr = editor.state.tr
    expect(applyWrapIntoColumns(tr, editor.schema, doctored!)).toBe(false)
    expect(tr.getMeta("preventDispatch")).toBe(true)
    // The tr DID mutate (the run was removed) — exactly why it must not ship.
    expect(tr.docChanged).toBe(true)
  })

  it("post-removal layout recheck failure sets preventDispatch (addColumn shape)", () => {
    // Same doctoring approach: point layoutPos at a non-layout node so the
    // post-mapping TYPE recheck fires after removeMoveSource has mutated the tr.
    const editor = twoColEditor()
    const resolved = resolveWrapIntoColumns(editor.state.doc, ["r1"], {
      layoutId: "lay",
      index: 0,
    })
    expect(resolved).not.toBeNull()
    expect(resolved!.kind).toBe("addColumn")
    // r2 sits after the layout; its pos = r1.nodeSize + layout.nodeSize.
    const r2Pos =
      editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize
    expect(editor.state.doc.nodeAt(r2Pos)?.attrs.id).toBe("r2")
    const doctored = { ...resolved!, layoutPos: r2Pos }
    const tr = editor.state.tr
    expect(applyWrapIntoColumns(tr, editor.schema, doctored)).toBe(false)
    expect(tr.getMeta("preventDispatch")).toBe(true)
    expect(tr.docChanged).toBe(true)
  })

  it("post-removal layout IDENTITY recheck failure sets preventDispatch (addColumn shape)", () => {
    // Two layouts: resolve against layY, then doctor layoutPos onto layX — the
    // node IS a columnLayout (type recheck passes) but the id differs, so the
    // identity recheck (symmetric with the wrap shape's) must refuse.
    const editor = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "layX", depth: 0 }, [
        col(s, "x_a", 1, para(s, "xa1", "XA1")),
        col(s, "x_b", 1, para(s, "xb1", "XB1")),
      ]),
      s.nodes.columnLayout!.create({ id: "layY", depth: 0 }, [
        col(s, "y_a", 1, para(s, "ya1", "YA1")),
        col(s, "y_b", 1, para(s, "yb1", "YB1")),
      ]),
      para(s, "r1", "root-1"),
    ])
    const resolved = resolveWrapIntoColumns(editor.state.doc, ["r1"], {
      layoutId: "layY",
      index: 0,
    })
    expect(resolved).not.toBeNull()
    expect(resolved!.kind).toBe("addColumn")
    const doctored = { ...resolved!, layoutPos: 0 } // layX's pos
    const tr = editor.state.tr
    expect(applyWrapIntoColumns(tr, editor.schema, doctored)).toBe(false)
    expect(tr.getMeta("preventDispatch")).toBe(true)
    expect(tr.docChanged).toBe(true)
  })

  it("refuses when the dragged run IS the layout, contains a layout, or the id is unknown", () => {
    const editor = twoColEditor()
    expect(editor.commands.wrapIntoColumns(["lay"], { layoutId: "lay", index: 0 })).toBe(false)
    expect(editor.commands.wrapIntoColumns(["r1"], { layoutId: "nope", index: 0 })).toBe(false)
    const two = makeEditor((s) => [
      s.nodes.columnLayout!.create({ id: "layX", depth: 0 }, [
        col(s, "x_a", 1, para(s, "xa1", "XA1")),
        col(s, "x_b", 1, para(s, "xb1", "XB1")),
      ]),
      s.nodes.columnLayout!.create({ id: "layY", depth: 0 }, [
        col(s, "y_a", 1, para(s, "ya1", "YA1")),
        col(s, "y_b", 1, para(s, "yb1", "YB1")),
      ]),
    ])
    expect(two.commands.wrapIntoColumns(["layX"], { layoutId: "layY", index: 0 })).toBe(false)
  })
})
