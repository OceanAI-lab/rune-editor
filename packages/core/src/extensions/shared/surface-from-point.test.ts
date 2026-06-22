// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { surfaceFromPoint } from "./surface-from-point"

// NOTE: Task 1 Step 1 (the manual playground `posAtCoords` probe of the
// inter-column gap) is DEFERRED to Task 4 per the implementation brief — it is
// a real-browser observation, not a unit test.
//
// jsdom returns zero-size rects from getBoundingClientRect, so the
// rect-CONTAINMENT branch of surfaceFromPoint cannot be exercised without
// mocked rects. We mock the column elements' rects below to drive that branch;
// the full real-mouse path is covered by Task 3's Playwright e2e.

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
          content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
        },
      ],
    },
    { type: "paragraph", attrs: { id: "after" }, content: [{ type: "text", text: "after" }] },
  ])
  return editor
}

/** Absolute pos of the `column` node holding the body block with `id`. */
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

describe("surfaceFromPoint", () => {
  it("returns the root surface (-1) when no column contains the point", () => {
    const editor = mkColumnsEditor()
    // Columns get zero-size rects in jsdom, so nothing contains the point.
    expect(surfaceFromPoint(editor.view, 50, 50)).toEqual({ surfacePos: -1 })
  })

  it("maps a column DOM element back to its PM pos (posAtDOM(el,0)-1 == column node pos)", () => {
    // This pins the DOM→pos mapping the resolver relies on, independent of
    // rect geometry. Mock the LEFT column's rect to contain the point.
    const editor = mkColumnsEditor()
    const cols = container.querySelectorAll<HTMLElement>("[data-rune-column]")
    expect(cols.length).toBe(2)
    cols[0]!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    cols[1]!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 100, left: 200, right: 300, width: 100, height: 100, x: 200, y: 0, toJSON: () => ({}) }) as DOMRect

    const expectedLeftPos = columnPosFor(editor, "L0")
    const expectedRightPos = columnPosFor(editor, "R0")
    expect(expectedLeftPos).toBeGreaterThan(0)

    const left = surfaceFromPoint(editor.view, 50, 50)
    expect(left.surfacePos).toBe(expectedLeftPos)

    const right = surfaceFromPoint(editor.view, 250, 50)
    expect(right.surfacePos).toBe(expectedRightPos)
  })

  it("falls back to root when the point is outside both column rects", () => {
    const editor = mkColumnsEditor()
    const cols = container.querySelectorAll<HTMLElement>("[data-rune-column]")
    cols[0]!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    cols[1]!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 100, left: 200, right: 300, width: 100, height: 100, x: 200, y: 0, toJSON: () => ({}) }) as DOMRect
    // x=150 is in the inter-column gap (neither rect contains it).
    expect(surfaceFromPoint(editor.view, 150, 50)).toEqual({ surfacePos: -1 })
  })

  it("deepest-wins: the smaller (inner) containing rect is chosen", () => {
    // Generic deepest-containment check (v1 forbids nested columns, but the
    // resolver must not assume single-level). Simulate one column rect nested
    // inside the other's bounds; the smaller-area one must win.
    const editor = mkColumnsEditor()
    const cols = container.querySelectorAll<HTMLElement>("[data-rune-column]")
    // colR's rect is strictly contained inside colL's rect, both over (50,50).
    cols[0]!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 200, left: 0, right: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    cols[1]!.getBoundingClientRect = () =>
      ({ top: 40, bottom: 60, left: 40, right: 60, width: 20, height: 20, x: 40, y: 40, toJSON: () => ({}) }) as DOMRect

    const innerPos = columnPosFor(editor, "R0")
    expect(surfaceFromPoint(editor.view, 50, 50).surfacePos).toBe(innerPos)
  })
})
