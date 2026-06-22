// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { MultiBlockSelection } from "./MultiBlockSelection"
import { blockSelectionKey } from "./plugin"

// Task 5: surface-local MBS keyboard handlers. F4 — Mod-A inside a column is
// EXACTLY 2 stages (text → ROOT MBS, layout as one unit; NO column-local stage).
// F5 — Shift-arrow inside a column extends column-local and STOPS at the column
// edge. Escape from an in-column caret → a column-local single-block MBS.

/**
 * Fixture: paragraph r1 · columnLayout[ col_a[a1] · col_b[b1, b2] ] · r2.
 * Root has 3 children; col_b has 2 so the column-local edge-stop is observable.
 */
function fixture() {
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
      col("col_b", para("b1", "B1"), para("b2", "B2")),
    ]),
    para("r2", "root-2"),
  ])
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
  )
  return editor
}

function startOf(editor: ReturnType<typeof createTestEditor>, id: string): number {
  let p = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.id === id) p = pos + 1
    return p === -1
  })
  return p
}

function contentSizeOf(editor: ReturnType<typeof createTestEditor>, id: string): number {
  let size = 0
  editor.state.doc.descendants((node) => {
    if (node.attrs?.id === id) size = node.content.size
    return true
  })
  return size
}

function setCaret(editor: ReturnType<typeof createTestEditor>, pos: number) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)))
}

function fireKey(
  editor: ReturnType<typeof createTestEditor>,
  key: string,
  mods: { meta?: boolean; shift?: boolean } = {},
): boolean {
  const isMac = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
  const useMeta = (mods.meta ?? false) && isMac
  const useCtrl = (mods.meta ?? false) && !isMac
  const event = new KeyboardEvent("keydown", {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    metaKey: useMeta,
    ctrlKey: useCtrl,
    shiftKey: mods.shift ?? false,
    bubbles: true,
    cancelable: true,
  })
  editor.view.dom.dispatchEvent(event)
  return event.defaultPrevented
}

describe("Keymap: Mod-A inside a column (F4 — 2 stages, root expansion)", () => {
  it("stage 1: caret in a column child → selects THAT child's text", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b1") + 1) // mid-text inside b1
    fireKey(editor, "a", { meta: true })
    const sel = editor.state.selection
    expect(sel).toBeInstanceOf(TextSelection)
    expect(sel.from).toBe(startOf(editor, "b1"))
    expect(sel.to).toBe(startOf(editor, "b1") + contentSizeOf(editor, "b1"))
  })

  it("stage 2: whole column-child text selected → ROOT MBS over ALL root blocks (NOT the column's children)", () => {
    const editor = fixture()
    const from = startOf(editor, "b1")
    const to = from + contentSizeOf(editor, "b1")
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    )
    fireKey(editor, "a", { meta: true })
    const sel = editor.state.selection
    expect(sel).toBeInstanceOf(MultiBlockSelection)
    const mbs = sel as MultiBlockSelection
    // ROOT surface, all 3 root blocks (r1, lay, r2) — the layout as ONE unit.
    expect(mbs.surface).toBe(editor.state.doc)
    expect(mbs.blockIndices).toEqual([0, 2])
  })

  it("works for a 2-block column too (b2): stage 2 still selects all root blocks", () => {
    const editor = fixture()
    const from = startOf(editor, "b2")
    const to = from + contentSizeOf(editor, "b2")
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    )
    fireKey(editor, "a", { meta: true })
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface).toBe(editor.state.doc)
    expect(mbs.blockIndices).toEqual([0, 2])
  })

  it("stage 3 (3rd press): already root-full MBS → no-op, consumed", () => {
    const editor = fixture()
    const from = startOf(editor, "b1")
    const to = from + contentSizeOf(editor, "b1")
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    )
    fireKey(editor, "a", { meta: true }) // → root MBS [0,2]
    const consumed = fireKey(editor, "a", { meta: true }) // no-op
    expect(consumed).toBe(true)
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface).toBe(editor.state.doc)
    expect(mbs.blockIndices).toEqual([0, 2])
  })

  it("column-local MBS + Mod-A → expands to ROOT full MBS (all root blocks)", () => {
    const editor = fixture()
    // Build a column-local single-block MBS over b1.
    const surfacePos = (() => {
      let sp = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.attrs?.id === "col_b") sp = pos + 1
        return sp === -1
      })
      return sp
    })()
    const $surface = editor.state.doc.resolve(surfacePos)
    editor.view.dispatch(
      editor.state.tr.setSelection(MultiBlockSelection.create(editor.state.doc, 0, 0, $surface)),
    )
    expect((editor.state.selection as MultiBlockSelection).surface.type.name).toBe("column")
    fireKey(editor, "a", { meta: true })
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface).toBe(editor.state.doc)
    expect(mbs.blockIndices).toEqual([0, 2])
  })
})

describe("Keymap: Escape inside a column (column-local single-block MBS)", () => {
  it("caret in a column child → column-local MBS over that block", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b2") + 1)
    fireKey(editor, "Escape")
    const sel = editor.state.selection
    expect(sel).toBeInstanceOf(MultiBlockSelection)
    const mbs = sel as MultiBlockSelection
    expect(mbs.surface.type.name).toBe("column")
    expect(mbs.blockIndices).toEqual([1, 1]) // b2 is index 1 in col_b
    // Anchor set to the column child id.
    expect(blockSelectionKey.getState(editor.state)?.anchorBlockId).toBe("b2")
  })
})

describe("Keymap: Shift-arrow inside a column (F5 — column-local, stop at edge)", () => {
  it("Shift+↓ from b1 (col_b idx 0) extends to b2 — stays column-local", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b1") + 1)
    fireKey(editor, "Escape") // → column MBS [0,0]
    fireKey(editor, "ArrowDown", { shift: true })
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface.type.name).toBe("column")
    expect(mbs.blockIndices).toEqual([0, 1])
  })

  it("Shift+↓ from b2 (last col_b child) clamps at column edge — NO jump to root", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b2") + 1)
    fireKey(editor, "Escape") // → column MBS [1,1]
    fireKey(editor, "ArrowDown", { shift: true })
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface.type.name).toBe("column")
    expect(mbs.blockIndices).toEqual([1, 1])
  })

  it("Shift+↑ from b1 (first col_b child) clamps at column edge", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b1") + 1)
    fireKey(editor, "Escape") // → column MBS [0,0]
    fireKey(editor, "ArrowUp", { shift: true })
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface.type.name).toBe("column")
    expect(mbs.blockIndices).toEqual([0, 0])
  })

  it("Shift+↑ from a1 (single-child col_a) clamps — column has only 1 child", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "a1") + 1)
    fireKey(editor, "Escape") // → column MBS [0,0] in col_a
    fireKey(editor, "ArrowUp", { shift: true })
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface.type.name).toBe("column")
    expect(mbs.blockIndices).toEqual([0, 0])
  })
})

describe("Keymap: Arrow collapse-move inside a column (column-local)", () => {
  it("↓ from b1 column MBS moves to b2 (next column child)", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b1") + 1)
    fireKey(editor, "Escape") // col MBS [0,0]
    fireKey(editor, "ArrowDown")
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.surface.type.name).toBe("column")
    expect(mbs.blockIndices).toEqual([1, 1])
  })

  it("↓ from b2 (last) clamps at column edge", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b2") + 1)
    fireKey(editor, "Escape") // col MBS [1,1]
    fireKey(editor, "ArrowDown")
    const mbs = editor.state.selection as MultiBlockSelection
    expect(mbs.blockIndices).toEqual([1, 1])
  })
})

describe("Keymap: Enter from a column MBS collapses into the column child", () => {
  it("Enter → TextSelection at end of the first selected column child", () => {
    const editor = fixture()
    setCaret(editor, startOf(editor, "b1") + 1)
    fireKey(editor, "Escape") // col MBS [0,0]
    fireKey(editor, "Enter")
    const sel = editor.state.selection
    expect(sel).toBeInstanceOf(TextSelection)
    expect(sel.from).toBe(startOf(editor, "b1") + contentSizeOf(editor, "b1"))
  })
})
