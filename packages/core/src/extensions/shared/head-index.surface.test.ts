// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { headIndexAtY } from "./head-index"

// Surface-aware generalization of headIndexAtY (Task 1 Step 4). The ROOT
// behavior is frozen and characterized in head-index.test.ts (left UNMODIFIED);
// these cases exercise the new `surface` argument against a column surface.
//
// jsdom returns zero-size rects, so the rect-fallback branch needs mocked
// rects; the posAtCoords-index branch is driven by stubbing posAtCoords (same
// idiom as head-index.test.ts). Real-mouse coordinate walks are Task 3 e2e.

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

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

function deepPosFor(editor: ReturnType<typeof mkColumnsEditor>, id: string): number {
  let p = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.id === id) {
      p = pos + 2 // inside the text
      return false
    }
    return true
  })
  return p
}

describe("headIndexAtY — surface-aware (column surface)", () => {
  it("resolves a deep hit to the index WITHIN the column's children", () => {
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")
    expect(colRPos).toBeGreaterThan(0)

    // Hit inside R1 (the SECOND child of the right column) → surface index 1.
    const r1Pos = deepPosFor(editor, "R1")
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: r1Pos, inside: r1Pos - 1 })

    expect(headIndexAtY(editor.view, 50, 50, { surface: { surfacePos: colRPos } })).toBe(1)

    // Hit inside R0 → surface index 0.
    const r0Pos = deepPosFor(editor, "R0")
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: r0Pos, inside: r0Pos - 1 })
    expect(headIndexAtY(editor.view, 50, 50, { surface: { surfacePos: colRPos } })).toBe(0)
  })

  it("clamps a hit at/past the column end to the last surface child", () => {
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")
    // posAtCoords resolving past the surface end clamps to childCount-1 = 1.
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: editor.state.doc.content.size, inside: -1 })
    expect(headIndexAtY(editor.view, 50, 50, { surface: { surfacePos: colRPos } })).toBe(1)
  })

  it("strict: a hit at the column's end boundary returns null (void below last child)", () => {
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")
    const colNode = editor.state.doc.nodeAt(colRPos)!
    // childStart = colRPos + 1; surfaceEnd = childStart + content.size.
    const surfaceEnd = colRPos + 1 + colNode.content.size
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: surfaceEnd, inside: -1 })
    expect(headIndexAtY(editor.view, 50, 50, { strict: true, surface: { surfacePos: colRPos } })).toBeNull()
  })

  it("rect fallback walks the column's children when posAtCoords is null", () => {
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null

    // Mock the two right-column children's rects via nodeDOM.
    const r0Pos = columnPosFor(editor, "R0") + 1 // first child pos = colStart
    const colNode = editor.state.doc.nodeAt(colRPos)!
    const child0Pos = colRPos + 1
    const child1Pos = child0Pos + colNode.child(0).nodeSize
    void r0Pos
    const originalNodeDOM = editor.view.nodeDOM.bind(editor.view)
    editor.view.nodeDOM = ((pos: number) => {
      if (pos === child0Pos) {
        const el = document.createElement("p")
        el.getBoundingClientRect = () =>
          ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        return el
      }
      if (pos === child1Pos) {
        const el = document.createElement("p")
        el.getBoundingClientRect = () =>
          ({ top: 40, bottom: 60, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        return el
      }
      return originalNodeDOM(pos)
    }) as typeof editor.view.nodeDOM

    expect(headIndexAtY(editor.view, 0, 10, { surface: { surfacePos: colRPos } })).toBe(0) // inside child0
    expect(headIndexAtY(editor.view, 0, 50, { surface: { surfacePos: colRPos } })).toBe(1) // inside child1
    expect(headIndexAtY(editor.view, 0, -10, { surface: { surfacePos: colRPos } })).toBe(0) // above → first
    expect(headIndexAtY(editor.view, 0, 999, { surface: { surfacePos: colRPos } })).toBe(1) // below → last
    expect(headIndexAtY(editor.view, 0, 999, { strict: true, surface: { surfacePos: colRPos } })).toBeNull()
  })

  it("does NOT leak a sibling column's index when posAtCoords snaps across the gap", () => {
    // Regression: the fast path must be confined to the requested surface.
    // posAtCoords snaps to the nearest text, which at a thin inter-column gap
    // can land inside the SIBLING column. The bare depth check would then return
    // the sibling's child index AS this surface's index. Fixed: fall through to
    // the rect walk over THIS column's children.
    const editor = mkColumnsEditor()
    const colRPos = columnPosFor(editor, "R0")

    // posAtCoords resolves into the LEFT column's child (L0, index 0 there)…
    const l0Pos = deepPosFor(editor, "L0")
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: l0Pos, inside: l0Pos - 1 })

    // …while we mock the RIGHT column's rects so the rect walk lands on child1.
    const colNode = editor.state.doc.nodeAt(colRPos)!
    const child0Pos = colRPos + 1
    const child1Pos = child0Pos + colNode.child(0).nodeSize
    const originalNodeDOM = editor.view.nodeDOM.bind(editor.view)
    editor.view.nodeDOM = ((pos: number) => {
      if (pos === child0Pos) {
        const el = document.createElement("p")
        el.getBoundingClientRect = () =>
          ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        return el
      }
      if (pos === child1Pos) {
        const el = document.createElement("p")
        el.getBoundingClientRect = () =>
          ({ top: 40, bottom: 60, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        return el
      }
      return originalNodeDOM(pos)
    }) as typeof editor.view.nodeDOM

    // clientY=50 is inside child1 → 1. The buggy fast path would have returned
    // L0's leaked index (0) instead.
    expect(headIndexAtY(editor.view, 0, 50, { surface: { surfacePos: colRPos } })).toBe(1)
  })

  it("atom inside-preference: a right-half hit over an in-column atom returns the atom's index WITHIN the column", () => {
    // Same caret bias as the root case (head-index.test.ts): posAtCoords on an
    // atom's right half resolves `pos` to the boundary AFTER it, which would
    // read as the NEXT column child. `inside` names the atom; prefer it.
    const editor = createTestEditor({ element: container })
    editor.commands.setContent([
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
              { type: "image", attrs: { id: "img1", src: "https://cdn.example/a.png" } },
              { type: "paragraph", attrs: { id: "R2" }, content: [{ type: "text", text: "r2" }] },
            ],
          },
        ],
      },
    ])
    let colRPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.id === "colR") colRPos = pos
      return node.attrs?.id !== "colR"
    })
    expect(colRPos).toBeGreaterThan(0)
    const colNode = editor.state.doc.nodeAt(colRPos)!
    const imgPos = colRPos + 1 + colNode.child(0).nodeSize
    expect(editor.state.doc.nodeAt(imgPos)?.type.name).toBe("image")
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: imgPos + colNode.child(1).nodeSize, inside: imgPos })

    expect(headIndexAtY(editor.view, 50, 50, { surface: { surfacePos: colRPos } })).toBe(1)
    expect(headIndexAtY(editor.view, 50, 50, { strict: true, surface: { surfacePos: colRPos } })).toBe(1)
  })

  it("atom inside-preference is confined to the requested surface (sibling-column atom falls through to the rect walk)", () => {
    // Surface-confinement parity with the caret path: an `inside` naming an
    // atom in the LEFT column must not short-circuit a RIGHT-column query.
    const editor = createTestEditor({ element: container })
    editor.commands.setContent([
      {
        type: "columnLayout",
        attrs: { id: "cl", depth: 0 },
        content: [
          {
            type: "column",
            attrs: { id: "colL", width: 1 },
            content: [{ type: "image", attrs: { id: "imgL", src: "https://cdn.example/a.png" } }],
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
    ])
    let colLPos = -1
    let colRPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.id === "colL") colLPos = pos
      if (node.attrs?.id === "colR") colRPos = pos
      return node.type.name === "columnLayout"
    })
    expect(colLPos).toBeGreaterThan(0)
    expect(colRPos).toBeGreaterThan(0)
    const imgPos = colLPos + 1
    expect(editor.state.doc.nodeAt(imgPos)?.type.name).toBe("image")
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: imgPos + editor.state.doc.nodeAt(imgPos)!.nodeSize, inside: imgPos })

    // Mock the RIGHT column's child rects so the rect walk (the expected
    // fallback) resolves clientY=50 to child index 1.
    const colNode = editor.state.doc.nodeAt(colRPos)!
    const child0Pos = colRPos + 1
    const child1Pos = child0Pos + colNode.child(0).nodeSize
    const originalNodeDOM = editor.view.nodeDOM.bind(editor.view)
    editor.view.nodeDOM = ((pos: number) => {
      if (pos === child0Pos) {
        const el = document.createElement("p")
        el.getBoundingClientRect = () =>
          ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        return el
      }
      if (pos === child1Pos) {
        const el = document.createElement("p")
        el.getBoundingClientRect = () =>
          ({ top: 40, bottom: 60, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
        return el
      }
      return originalNodeDOM(pos)
    }) as typeof editor.view.nodeDOM

    expect(headIndexAtY(editor.view, 0, 50, { surface: { surfacePos: colRPos } })).toBe(1)
  })

  it("root surface arg is identical to omitting it", () => {
    const editor = mkColumnsEditor()
    ;(editor.view.posAtCoords as unknown as (c: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: 2, inside: 1 })
    const omitted = headIndexAtY(editor.view, 50, 50)
    const rooted = headIndexAtY(editor.view, 50, 50, { surface: { surfacePos: -1 } })
    expect(rooted).toBe(omitted)
  })
})
