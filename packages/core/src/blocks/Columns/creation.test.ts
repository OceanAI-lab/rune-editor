// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { getDocument } from "../../api/queries/getDocument"
import { getDefaultSlashMenuItems } from "../../extensions/suggestion-menus/default-items"
import { getBlockSpecs } from "../../schema/blocks/registry"
import { sideMenuKey } from "../../extensions/side-menu/SideMenu"
import type { DefaultSuggestionItem } from "../../extensions/suggestion-menus/default-items/types"
import type { RuneColumnsBlock } from "./block"

// Pull the columnLayout block's slashMenuItems off the editor storage.
function columnsSlashItems(editor: ReturnType<typeof createTestEditor>): DefaultSuggestionItem[] {
  const fn = (
    editor.extensionManager.extensions.find((e) => e.name === "columnLayout")!
      .storage as {
      slashMenuItems?: (e: typeof editor) => DefaultSuggestionItem[]
    }
  ).slashMenuItems
  expect(typeof fn).toBe("function")
  return fn!(editor)
}

describe("columns slash menu (E1)", () => {
  it("exposes one item per column count (2..5) in 'Basic blocks', 2-col first", () => {
    const editor = createTestEditor()
    const items = columnsSlashItems(editor)
    expect(items.map((i) => i.key)).toEqual([
      "columns_2",
      "columns_3",
      "columns_4",
      "columns_5",
    ])
    expect(items.map((i) => i.title)).toEqual([
      "2 columns",
      "3 columns",
      "4 columns",
      "5 columns",
    ])
    for (const item of items) {
      expect(item.group).toBe("Basic blocks")
      // Shared alias: `/columns` surfaces every count.
      expect(item.aliases).toContain("columns")
      // Declarative descriptor present so it is also a turn-into target.
      expect(item.block?.type).toBe("columnLayout")
    }
  })

  it("inserts a 2-column layout, each column seeded with an empty paragraph (E2)", () => {
    const editor = createTestEditor()
    // Empty paragraph + the slash trigger text "/".
    editor.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "/" }] }])
    const item = columnsSlashItems(editor)[0]!
    // Trigger range covers the "/" we typed (positions 1..2 inside the para).
    item.onItemClick({ editor, range: { from: 1, to: 2 }, triggerCharacter: "/" })

    const doc = getDocument(editor)
    const layouts = doc.filter((b) => b.type === "columnLayout") as RuneColumnsBlock[]
    expect(layouts).toHaveLength(1)
    const layout = layouts[0]!
    expect(layout.columns).toHaveLength(2)
    // Each column holds exactly one empty paragraph (E2 seed).
    for (const col of layout.columns) {
      expect(col.children).toHaveLength(1)
      expect(col.children[0]!.type).toBe("paragraph")
    }
  })

  it("lands the caret inside the FIRST column's paragraph", () => {
    const editor = createTestEditor()
    editor.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "/" }] }])
    const item = columnsSlashItems(editor)[0]!
    item.onItemClick({ editor, range: { from: 1, to: 2 }, triggerCharacter: "/" })

    const { $from } = editor.state.selection
    // Caret must be inside a paragraph that lives inside a column.
    expect($from.parent.type.name).toBe("paragraph")
    let insideColumn = false
    let insideFirstColumn = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "column") {
        insideColumn = true
        // The column's index among the layout's children must be 0 (first).
        insideFirstColumn = $from.index(d - 1) === 0
        break
      }
    }
    expect(insideColumn).toBe(true)
    expect(insideFirstColumn).toBe(true)
  })

  it("is listed by getDefaultSlashMenuItems (kit registration end-to-end)", () => {
    const editor = createTestEditor()
    const keys = getDefaultSlashMenuItems(editor).map((i) => i.key)
    for (const key of ["columns_2", "columns_3", "columns_4", "columns_5"]) {
      expect(keys).toContain(key)
    }
  })

  it("the N-column items insert N-column layouts (3..5)", () => {
    for (const count of [3, 4, 5]) {
      const editor = createTestEditor()
      editor.commands.setContent([{ type: "paragraph", content: [{ type: "text", text: "/" }] }])
      const item = columnsSlashItems(editor).find((i) => i.key === `columns_${count}`)!
      item.onItemClick({ editor, range: { from: 1, to: 2 }, triggerCharacter: "/" })

      const doc = getDocument(editor)
      const layouts = doc.filter((b) => b.type === "columnLayout") as RuneColumnsBlock[]
      expect(layouts).toHaveLength(1)
      expect(layouts[0]!.columns).toHaveLength(count)
      // Each column holds exactly one empty paragraph (E2 seed).
      for (const col of layouts[0]!.columns) {
        expect(col.children).toHaveLength(1)
        expect(col.children[0]!.type).toBe("paragraph")
      }
    }
  })

  it("refuses to run when the slash range sits INSIDE a column (no nested layouts — Task 3 Step 3 insert guard)", () => {
    const editor = createTestEditor()
    editor.commands.setContent([
      {
        type: "columnLayout",
        attrs: { id: "cl1", depth: 0 },
        content: [
          {
            type: "column",
            attrs: { id: "colL", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "/" }] }],
          },
          {
            type: "column",
            attrs: { id: "colR", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
          },
        ],
      },
    ])
    // Slash range = the "/" inside the left column's paragraph.
    let slashFrom = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.id === "L0") {
        slashFrom = pos + 1
        return false
      }
      return true
    })
    const before = editor.state.doc.toJSON()
    const item = columnsSlashItems(editor)[0]!
    item.onItemClick({ editor, range: { from: slashFrom, to: slashFrom + 1 }, triggerCharacter: "/" })
    // Full no-op: exactly one layout, document byte-identical (mirrors the
    // fromInput-null refusal precedent — trigger text included).
    expect(editor.state.doc.toJSON()).toEqual(before)
    expect(getDocument(editor).filter((b) => b.type === "columnLayout")).toHaveLength(1)
  })
})

describe("columnLayout as a unit (Step 3)", () => {
  function withLayout() {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const editor = createTestEditor({ element: el })
    editor.commands.setContent([
      { type: "paragraph", attrs: { id: "p0" }, content: [{ type: "text", text: "before" }] },
      {
        type: "columnLayout",
        attrs: { id: "cl1", depth: 0 },
        content: [
          {
            type: "column",
            attrs: { id: "colL", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "left" }] }],
          },
          {
            type: "column",
            attrs: { id: "colR", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
          },
        ],
      },
    ])
    return editor
  }

  it("registers as side-menu draggable with NO dragSourceRange override (default = whole layout node)", () => {
    const editor = withLayout()
    const spec = getBlockSpecs(editor)["columnLayout"]!
    // Drag/grip machinery picks the whole node range when no hook exists —
    // the layout drags as ONE unit (block-drag gesture.ts default).
    expect(spec.sideMenu?.draggable).toBe(true)
    expect(spec.dragSourceRange).toBeUndefined()
  })

  it("side-menu widget decoration renders when the layout is the hovered block", () => {
    const editor = withLayout()
    // Layout is the second root child — its pos is the first paragraph's size.
    const layoutPos = editor.state.doc.child(0).nodeSize
    expect(editor.state.doc.nodeAt(layoutPos)?.type.name).toBe("columnLayout")
    editor.view.dispatch(editor.state.tr.setMeta(sideMenuKey, { hoveredPos: layoutPos }))
    expect(editor.view.dom.querySelector(".rune-side-menu")).not.toBeNull()
  })
})
