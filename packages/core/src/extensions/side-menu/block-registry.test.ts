// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Divider } from "../../blocks"
import { createBlockSpec } from "../../schema"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { isDraggable, draggableAncestorPosFor } from "./block-registry"

const Para = createBlockSpec({
  type: "paragraph",
  content: "inline*",
  parseDOM: [{ tag: "p" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
  sideMenu: { draggable: true },
})

const Heading = createBlockSpec({
  type: "heading",
  content: "inline*",
  parseDOM: [{ tag: "h2" }],
  renderDOM: ({ HTMLAttributes }) => ["h2", HTMLAttributes, 0],
  sideMenu: { draggable: true },
})

const NonDraggable = createBlockSpec({
  type: "nonDraggable",
  content: "",
  parseDOM: [{ tag: "aside" }],
  renderDOM: ({ HTMLAttributes }) => [
    "aside",
    { ...HTMLAttributes, class: "rune-block" },
  ],
})

function mkEditor() {
  return new Editor({
    extensions: [Document, Text, Para, Heading, NonDraggable],
    content: "<p>a</p>",
  })
}

describe("isDraggable", () => {
  it("returns true for registered draggable blocks", () => {
    const editor = mkEditor()
    expect(isDraggable("paragraph", editor)).toBe(true)
    expect(isDraggable("heading", editor)).toBe(true)
    editor.destroy()
  })

  it("returns false for registered non-draggable blocks", () => {
    const editor = mkEditor()
    expect(isDraggable("nonDraggable", editor)).toBe(false)
    editor.destroy()
  })

  it("returns true for the built-in Divider when registered", () => {
    const editor = new Editor({
      extensions: [Document, Text, Divider],
      content: "<hr>",
    })
    expect(isDraggable("divider", editor)).toBe(true)
    editor.destroy()
  })

  it("returns false for unregistered types", () => {
    const editor = mkEditor()
    expect(isDraggable("doc", editor)).toBe(false)
    expect(isDraggable("unknown", editor)).toBe(false)
    editor.destroy()
  })
})

describe("draggableAncestorPosFor", () => {
  it("resolves the top-level paragraph pos when cursor is in text", () => {
    const editor = mkEditor()
    expect(draggableAncestorPosFor(editor.view, 1, editor)).toBe(0)
    editor.destroy()
  })

  it("returns null when no draggable ancestor exists", () => {
    const editor = new Editor({
      extensions: [Document, Text, NonDraggable],
      content: "<aside></aside>",
    })
    expect(draggableAncestorPosFor(editor.view, 0, editor)).toBeNull()
    expect(draggableAncestorPosFor(editor.view, 1, editor)).toBeNull()
    editor.destroy()
  })

  it("resolves the built-in Divider at the top-level boundary before the atom", () => {
    const editor = new Editor({
      extensions: [Document, Text, Divider],
      content: "<hr>",
    })
    expect(draggableAncestorPosFor(editor.view, 0, editor)).toBe(0)
    editor.destroy()
  })

  it("resolves the built-in Divider at the top-level boundary after the atom", () => {
    const editor = new Editor({
      extensions: [Document, Text, Divider],
      content: "<hr>",
    })
    expect(draggableAncestorPosFor(editor.view, 1, editor)).toBe(0)
    editor.destroy()
  })

  // Columns Phase 2 (F3): innermost draggable wins. A hit inside a column
  // child resolves to THAT child's grip; a hit on layout chrome (the gap /
  // the columnLayout's own boundary, where posAtCoords lands per the Task 4
  // probe) still resolves to the layout.
  function mkColumns() {
    const editor = createTestEditor()
    editor.commands.setContent([
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

  it("inside a column child, resolves the in-column PARAGRAPH's pos (innermost draggable wins, F3)", () => {
    const editor = mkColumns()
    let hit = -1
    let blockPos = -1
    editor.state.doc.descendants((n, pos) => {
      if (n.attrs?.id === "L0") {
        blockPos = pos
        hit = pos + 1 // a caret inside the paragraph's text
        return false
      }
      return true
    })
    const resolved = draggableAncestorPosFor(editor.view, hit, editor)
    expect(resolved).not.toBeNull()
    const node = editor.state.doc.nodeAt(resolved!)
    expect(node?.type.name).toBe("paragraph")
    expect(node?.attrs.id).toBe("L0")
    expect(resolved).toBe(blockPos)
  })

  // F3 atom leg: a draggable ATOM inside a column (divider/image) has no
  // draggable on the hit's ancestor chain below the layout — the boundary pos
  // resolves with the structural `column` as parent. The atom-sibling fallback
  // must be consulted at the COLUMN surface level BEFORE settling on the
  // columnLayout ancestor, or in-column atoms never get their own grip.
  function mkColumnsWithDivider() {
    const editor = createTestEditor()
    editor.commands.setContent([
      {
        type: "columnLayout",
        attrs: { id: "cl1", depth: 0 },
        content: [
          {
            type: "column",
            attrs: { id: "colL", width: 1 },
            content: [
              { type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "left" }] },
              { type: "divider", attrs: { id: "D0" } },
            ],
          },
          {
            type: "column",
            attrs: { id: "colR", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
          },
        ],
      },
    ])
    let dividerPos = -1
    editor.state.doc.descendants((n, pos) => {
      if (n.attrs?.id === "D0") {
        dividerPos = pos
        return false
      }
      return true
    })
    return { editor, dividerPos }
  }

  it("atom inside a column, hit at the boundary BEFORE it → the atom's own pos, not the layout (F3 innermost wins)", () => {
    const { editor, dividerPos } = mkColumnsWithDivider()
    const resolved = draggableAncestorPosFor(editor.view, dividerPos, editor)
    expect(resolved).toBe(dividerPos)
    expect(editor.state.doc.nodeAt(resolved!)?.type.name).toBe("divider")
  })

  it("atom inside a column, hit at the boundary AFTER it → the atom's own pos, not the layout", () => {
    const { editor, dividerPos } = mkColumnsWithDivider()
    const after = dividerPos + editor.state.doc.nodeAt(dividerPos)!.nodeSize
    const resolved = draggableAncestorPosFor(editor.view, after, editor)
    expect(resolved).toBe(dividerPos)
    expect(editor.state.doc.nodeAt(resolved!)?.type.name).toBe("divider")
  })

  it("on layout chrome / the columnLayout boundary (the gap), resolves the LAYOUT pos", () => {
    const editor = mkColumns()
    // The columnLayout's own content boundary — where posAtCoords lands for a
    // hit in the inter-column gap (Task 4 probe: depthChain columnLayout > doc).
    let layoutPos = -1
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === "columnLayout") {
        layoutPos = pos
        return false
      }
      return true
    })
    // A position just inside the layout but before any column child resolves
    // with the columnLayout as the deepest ancestor (no column on the chain).
    const hit = layoutPos + 1
    const resolved = draggableAncestorPosFor(editor.view, hit, editor)
    expect(resolved).not.toBeNull()
    const node = editor.state.doc.nodeAt(resolved!)
    expect(node?.type.name).toBe("columnLayout")
    expect(resolved).toBe(layoutPos)
  })
})
