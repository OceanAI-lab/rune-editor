// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { surfaceBlockSnapshot, snapshotBlocks } from "./block-drag-geometry"
import { createTestEditor } from "../../test-utils/createTestEditor"
import type { EditorView } from "@tiptap/pm/view"

// surfaceBlockSnapshot (Task 1 Step 2). snapshotBlocks now delegates to it for
// the root surface; its existing behavior is characterized in
// block-drag-geometry.test.ts (UNMODIFIED). These cases pin the column-surface
// path + the root-delegation parity.
//
// jsdom returns zero-size rects, so block rects are mocked via nodeDOM (same
// idiom as block-drag-geometry.test.ts). The pure index/order/min-max math is
// what we assert; the live rect path is covered by Task 3 Playwright e2e.

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

function rectAt(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function mkColumnsEditor() {
  const editor = createTestEditor({ element: container })
  editor.commands.setContent([
    { type: "paragraph", attrs: { id: "before" }, content: [{ type: "text", text: "before" }] },
    {
      type: "columnLayout",
      attrs: { id: "cl", depth: 0 },
      content: [
        {
          type: "column",
          attrs: { id: "colL", width: 1 },
          content: [{ type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "left" }] }],
        },
        {
          type: "column",
          attrs: { id: "colR", width: 1 },
          content: [
            { type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "r0" }] },
            { type: "paragraph", attrs: { id: "R1" }, content: [{ type: "text", text: "r1" }] },
          ],
        },
      ],
    },
    { type: "paragraph", attrs: { id: "after" }, content: [{ type: "text", text: "after" }] },
  ])
  return editor
}

function columnPosFor(editor: ReturnType<typeof mkColumnsEditor>, childId: string): number {
  let colPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "column") {
      node.descendants((child) => {
        if (child.attrs?.id === childId) colPos = pos
        return false
      })
    }
    return true
  })
  return colPos
}

/** Mock each top-level / column-child block's rect by absolute pos. */
function mockRects(editor: ReturnType<typeof mkColumnsEditor>, rectsByPos: Map<number, DOMRect>) {
  const originalNodeDOM = editor.view.nodeDOM.bind(editor.view)
  editor.view.nodeDOM = ((pos: number) => {
    const rect = rectsByPos.get(pos)
    if (!rect) return originalNodeDOM(pos)
    const el = document.createElement("p")
    el.getBoundingClientRect = () => rect
    return el
  }) as EditorView["nodeDOM"]
}

describe("surfaceBlockSnapshot", () => {
  it("root surface (-1) snapshots root blocks only, not column children", () => {
    const editor = mkColumnsEditor()
    // Root children: before(p), columnLayout, after(p).
    const rects = new Map<number, DOMRect>()
    let pos = 0
    editor.state.doc.forEach((node, p) => {
      void node
      pos = p
      rects.set(p, rectAt(p * 30, 10, 100, 20))
    })
    void pos
    mockRects(editor, rects)

    const snap = surfaceBlockSnapshot(editor.view, -1, editor)
    // before, columnLayout, after — the layout is a body block; columns are not.
    expect(snap.blocks.map((b) => b.type)).toEqual(["paragraph", "columnLayout", "paragraph"])
  })

  it("delegation: snapshotBlocks === surfaceBlockSnapshot(-1)", () => {
    const editor = mkColumnsEditor()
    const rects = new Map<number, DOMRect>()
    editor.state.doc.forEach((_node, p) => rects.set(p, rectAt(p * 30, 10, 100, 20)))
    mockRects(editor, rects)

    const viaPublic = snapshotBlocks(editor.view, editor)
    const viaSurface = surfaceBlockSnapshot(editor.view, -1, editor)
    expect(viaPublic).toEqual(viaSurface)
  })

  it("column surface snapshots that column's children in document order", () => {
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")
    expect(colRPos).toBeGreaterThan(0)
    const colNode = editor.state.doc.nodeAt(colRPos)!
    const child0Pos = colRPos + 1
    const child1Pos = child0Pos + colNode.child(0).nodeSize

    const rects = new Map<number, DOMRect>()
    rects.set(child0Pos, rectAt(0, 200, 80, 20))
    rects.set(child1Pos, rectAt(40, 210, 60, 20))
    mockRects(editor, rects)

    const snap = surfaceBlockSnapshot(editor.view, colRPos, editor)
    expect(snap.blocks).toHaveLength(2)
    expect(snap.blocks[0]!.pos).toBe(child0Pos)
    expect(snap.blocks[1]!.pos).toBe(child1Pos)
    expect(snap.blocks[0]!.top).toBe(0)
    expect(snap.blocks[1]!.top).toBe(40)
  })

  it("column surface minLeft/maxRight span the COLUMN's content, not the page", () => {
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")
    const colNode = editor.state.doc.nodeAt(colRPos)!
    const child0Pos = colRPos + 1
    const child1Pos = child0Pos + colNode.child(0).nodeSize

    const rects = new Map<number, DOMRect>()
    // Right column lives at x∈[200,280] / [210,270] — narrow band well inside
    // a wide page.
    rects.set(child0Pos, rectAt(0, 200, 80, 20))   // left 200 right 280
    rects.set(child1Pos, rectAt(40, 210, 50, 20))  // left 210 right 260
    mockRects(editor, rects)

    const snap = surfaceBlockSnapshot(editor.view, colRPos, editor)
    expect(snap.minLeft).toBe(200)
    expect(snap.maxRight).toBe(280)
  })

  it("returns an empty snapshot for a surfacePos that is not a column", () => {
    const editor = mkColumnsEditor()
    // Point at a root paragraph's pos (a body block, not a structural surface).
    let pPos = -1
    editor.state.doc.forEach((node, p) => {
      if (node.attrs?.id === "before") pPos = p
    })
    const snap = surfaceBlockSnapshot(editor.view, pPos, editor)
    expect(snap.blocks).toHaveLength(0)
  })
})
