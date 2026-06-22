// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { findCollapsedToggleContaining, toggleBodyRange, togglePosById } from "./range"

function makeEditor() {
  return createTestEditor()
}

describe("toggleBodyRange", () => {
  it("returns isEmpty for a toggle with no following siblings", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "t" }] },
    ])
    const togglePos = 0
    const r = toggleBodyRange(editor.state.doc, togglePos)
    expect(r.isEmpty).toBe(true)
    expect(r.to - r.from).toBe(0)
  })

  it("includes siblings whose depth > toggle.depth and stops at depth <= toggle.depth", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "t" }] },
      { type: "paragraph", attrs: { depth: 1 }, content: [{ type: "text", text: "child a" }] },
      { type: "paragraph", attrs: { depth: 1 }, content: [{ type: "text", text: "child b" }] },
      { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "sibling" }] },
    ])
    const togglePos = 0
    const toggleNode = editor.state.doc.firstChild!
    const r = toggleBodyRange(editor.state.doc, togglePos)
    expect(r.isEmpty).toBe(false)
    expect(r.from).toBe(togglePos + toggleNode.nodeSize)
    // body = two paragraphs of depth 1; ends right before the depth-0 sibling.
    const expectedTo = togglePos + toggleNode.nodeSize +
      editor.state.doc.child(1).nodeSize + editor.state.doc.child(2).nodeSize
    expect(r.to).toBe(expectedTo)
  })

  it("body spans nested toggles (children of a child toggle still count)", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "outer" }] },
      { type: "toggle", attrs: { depth: 1, level: 0, expanded: true }, content: [{ type: "text", text: "inner" }] },
      { type: "paragraph", attrs: { depth: 2 }, content: [{ type: "text", text: "deep" }] },
      { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "out" }] },
    ])
    const togglePos = 0
    const r = toggleBodyRange(editor.state.doc, togglePos)
    // body of outer = inner toggle + deep paragraph
    expect(r.isEmpty).toBe(false)
    const expectedTo = editor.state.doc.child(0).nodeSize +
      editor.state.doc.child(1).nodeSize +
      editor.state.doc.child(2).nodeSize
    expect(r.to).toBe(expectedTo)
  })
})

describe("toggleBodyRange — inside a column (surface-local)", () => {
  // Build a 2-column layout. The first column holds: toggle (depth 0),
  // body paragraph (depth 1), a depth-0 sibling. The second column holds a
  // single paragraph. The toggle's body must be its column-LOCAL deeper
  // siblings only — never spilling past the depth-0 sibling, and never into
  // the next column or root.
  function makeColumnDoc(extra: {
    firstColTrailing?: Array<{ depth: number; text: string }>
  } = {}) {
    const editor = makeEditor()
    const firstColumnChildren: unknown[] = [
      { type: "toggle", attrs: { depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "tog" }] },
      { type: "paragraph", attrs: { depth: 1 }, content: [{ type: "text", text: "child a" }] },
      { type: "paragraph", attrs: { depth: 1 }, content: [{ type: "text", text: "child b" }] },
    ]
    for (const t of extra.firstColTrailing ?? []) {
      firstColumnChildren.push({
        type: "paragraph",
        attrs: { depth: t.depth },
        content: [{ type: "text", text: t.text }],
      })
    }
    editor.commands.setContent([
      {
        type: "columnLayout",
        attrs: { depth: 0 },
        content: [
          { type: "column", attrs: { width: 1 }, content: firstColumnChildren },
          {
            type: "column",
            attrs: { width: 1 },
            content: [
              { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "col2" }] },
            ],
          },
        ],
      },
    ])
    let togglePos = -1
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === "toggle") togglePos = p
    })
    return { editor, togglePos }
  }

  it("collapses exactly its column-local deeper siblings, stopping at a shallower sibling", () => {
    const { editor, togglePos } = makeColumnDoc({
      firstColTrailing: [{ depth: 0, text: "sibling-stop" }],
    })
    const doc = editor.state.doc
    const toggle = doc.nodeAt(togglePos)!
    const r = toggleBodyRange(doc, togglePos)
    expect(r.isEmpty).toBe(false)
    expect(r.from).toBe(togglePos + toggle.nodeSize)
    // body = the two depth-1 paragraphs (indices 1 and 2 of the column),
    // stopping at the depth-0 "sibling-stop" paragraph.
    const $pos = doc.resolve(togglePos)
    const column = $pos.parent
    const childA = column.child(1)
    const childB = column.child(2)
    expect(r.to).toBe(r.from + childA.nodeSize + childB.nodeSize)
    // the range must NOT reach the depth-0 sibling.
    const stop = column.child(3)
    expect(stop.textContent).toBe("sibling-stop")
  })

  it("does not spill past the column boundary into the next column or root", () => {
    // No depth-0 sibling after the body in column 1 — the column's own
    // boundary (end of its children) must terminate the body, NOT bleed
    // into col2 / past the layout.
    const { editor, togglePos } = makeColumnDoc()
    const doc = editor.state.doc
    const toggle = doc.nodeAt(togglePos)!
    const r = toggleBodyRange(doc, togglePos)
    const $pos = doc.resolve(togglePos)
    const column = $pos.parent
    const childA = column.child(1)
    const childB = column.child(2)
    expect(r.from).toBe(togglePos + toggle.nodeSize)
    expect(r.to).toBe(r.from + childA.nodeSize + childB.nodeSize)
    // "to" must land at the end of column 1's content, never inside col2.
    const col2Para = doc.resolve(r.to + 2) // step past column close + open
    // r.to is at the end of col1 content; +1 closes col1, +1 opens col2 —
    // the resolved parent is exactly "column" (col2), never the outer layout.
    expect(col2Para.parent.type.name).toBe("column")
  })

  it("a toggle as the last block in a column (no body) collapses to nothing", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      {
        type: "columnLayout",
        attrs: { depth: 0 },
        content: [
          {
            type: "column",
            attrs: { width: 1 },
            content: [
              { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "head" }] },
              { type: "toggle", attrs: { depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "tog" }] },
            ],
          },
          {
            type: "column",
            attrs: { width: 1 },
            content: [
              { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "col2" }] },
            ],
          },
        ],
      },
    ])
    let togglePos = -1
    editor.state.doc.descendants((n, p) => {
      if (n.type.name === "toggle") togglePos = p
    })
    const toggle = editor.state.doc.nodeAt(togglePos)!
    const r = toggleBodyRange(editor.state.doc, togglePos)
    expect(r.isEmpty).toBe(true)
    expect(r.from).toBe(togglePos + toggle.nodeSize)
    expect(r.to).toBe(r.from)
  })
})

describe("togglePosById", () => {
  it("finds a root toggle by id", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { id: "tog-root", depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "t" }] },
    ])
    expect(togglePosById(editor.state.doc, "tog-root")).toBe(0)
  })

  it("finds a toggle nested inside a column by id", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      {
        type: "columnLayout",
        attrs: { depth: 0 },
        content: [
          {
            type: "column",
            attrs: { width: 1 },
            content: [
              { type: "toggle", attrs: { id: "tog-col", depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "t" }] },
            ],
          },
          {
            type: "column",
            attrs: { width: 1 },
            content: [
              { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "c2" }] },
            ],
          },
        ],
      },
    ])
    const pos = togglePosById(editor.state.doc, "tog-col")
    expect(pos).toBeGreaterThan(0)
    expect(editor.state.doc.nodeAt(pos)?.type.name).toBe("toggle")
    expect(editor.state.doc.nodeAt(pos)?.attrs.id).toBe("tog-col")
  })

  it("returns -1 for an unknown id", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { id: "x", depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "t" }] },
    ])
    expect(togglePosById(editor.state.doc, "nope")).toBe(-1)
  })
})

describe("findCollapsedToggleContaining", () => {
  it("returns the collapsed toggle whose body contains the position", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { depth: 0, level: 0, expanded: false }, content: [{ type: "text", text: "outer" }] },
      { type: "paragraph", attrs: { depth: 1 }, content: [{ type: "text", text: "hidden" }] },
      { type: "paragraph", attrs: { depth: 0 }, content: [{ type: "text", text: "after" }] },
    ])

    const body = toggleBodyRange(editor.state.doc, 0)
    const owner = findCollapsedToggleContaining(editor.state.doc, body.from)

    expect(owner?.pos).toBe(0)
    expect(owner?.node.textContent).toBe("outer")
    expect(findCollapsedToggleContaining(editor.state.doc, body.to)).toBeNull()
  })

  it("ignores expanded toggles", () => {
    const editor = makeEditor()
    editor.commands.setContent([
      { type: "toggle", attrs: { depth: 0, level: 0, expanded: true }, content: [{ type: "text", text: "outer" }] },
      { type: "paragraph", attrs: { depth: 1 }, content: [{ type: "text", text: "visible" }] },
    ])

    const body = toggleBodyRange(editor.state.doc, 0)

    expect(findCollapsedToggleContaining(editor.state.doc, body.from)).toBeNull()
  })
})
