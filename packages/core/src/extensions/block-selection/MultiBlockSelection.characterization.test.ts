// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { History } from "@tiptap/extension-history"
import { Paragraph, Heading } from "../../blocks"
import { BlockId } from "../block-id"
import { BlockSelection } from "./index"
import { MultiBlockSelection } from "./MultiBlockSelection"

// ─────────────────────────────────────────────────────────────────────────────
// Characterization tests — pin the CURRENT flat-doc behavior of
// MultiBlockSelection so the Task 4 "surface generalization" refactor can be
// proven behavior-identical. These MUST stay green UNMODIFIED across Steps 2-4
// (introduce $surface, bookmark resolve, optional static-create surface arg).
// If any of these needs editing to pass, the generalization broke equivalence.
// ─────────────────────────────────────────────────────────────────────────────

function makeEditor(blocks = 6) {
  const element = document.createElement("div")
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [Document, Text, Paragraph, Heading, History, BlockId, BlockSelection],
    content: {
      type: "doc",
      content: Array.from({ length: blocks }, (_, i) => ({
        type: "paragraph",
        content: [{ type: "text", text: `Block ${i + 1}` }],
      })),
    } as never,
  })
}

describe("MBS characterization — static create + blockIndices round-trip", () => {
  it("create(lo, hi) then blockIndices reads [lo, hi] back (forward)", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 1, 4)
    expect(sel.blockIndices).toEqual([1, 4])
    expect(sel.isForward).toBe(true)
    editor.destroy()
  })

  it("create(hi, lo) (backward) still reads blockIndices [lo, hi]", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 4, 1)
    expect(sel.blockIndices).toEqual([1, 4])
    expect(sel.isForward).toBe(false)
    editor.destroy()
  })

  it("N=1 round-trips", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 2, 2)
    expect(sel.blockIndices).toEqual([2, 2])
    expect(sel.blockNodes).toHaveLength(1)
    expect(sel.blockNodes[0]?.textContent).toBe("Block 3")
    editor.destroy()
  })

  it("N=all round-trips and blockNodes are in doc order", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 0, 5)
    expect(sel.blockIndices).toEqual([0, 5])
    expect(sel.blockNodes.map((n) => n.textContent)).toEqual([
      "Block 1",
      "Block 2",
      "Block 3",
      "Block 4",
      "Block 5",
      "Block 6",
    ])
    editor.destroy()
  })
})

describe("MBS characterization — map() across an insert", () => {
  function insertParagraphAt(editor: Editor, pos: number, text: string) {
    const paragraphType = editor.schema.nodes.paragraph
    if (!paragraphType) throw new Error("paragraph node type missing")
    return editor.state.tr.insert(pos, paragraphType.create(null, editor.schema.text(text)))
  }

  it("insert BEFORE the range shifts indices but preserves covered nodes", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 2, 4) // blocks 3..5
    const tr = insertParagraphAt(editor, 0, "New")
    const mapped = sel.map(tr.doc, tr.mapping) as MultiBlockSelection
    expect(mapped).toBeInstanceOf(MultiBlockSelection)
    // The inserted block pushes everything down: covered indices become [3, 5].
    expect(mapped.blockIndices).toEqual([3, 5])
    expect(mapped.blockNodes.map((n) => n.textContent)).toEqual(["Block 3", "Block 4", "Block 5"])
    editor.destroy()
  })

  it("insert AFTER the range leaves indices and nodes unchanged", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 1, 2) // blocks 2..3
    const tr = insertParagraphAt(editor, editor.state.doc.content.size, "Tail")
    const mapped = sel.map(tr.doc, tr.mapping) as MultiBlockSelection
    expect(mapped).toBeInstanceOf(MultiBlockSelection)
    expect(mapped.blockIndices).toEqual([1, 2])
    expect(mapped.blockNodes.map((n) => n.textContent)).toEqual(["Block 2", "Block 3"])
    editor.destroy()
  })

  it("insert INSIDE the range (between covered siblings) widens the covered span", () => {
    const editor = makeEditor()
    const doc = editor.state.doc
    const sel = MultiBlockSelection.create(doc, 1, 3) // blocks 2..4
    // Insert a paragraph at the boundary between block 2 and block 3.
    const insertPos = doc.child(0).nodeSize + doc.child(1).nodeSize // after block 2
    const tr = insertParagraphAt(editor, insertPos, "Mid")
    const mapped = sel.map(tr.doc, tr.mapping) as MultiBlockSelection
    expect(mapped).toBeInstanceOf(MultiBlockSelection)
    // anchor sat before block 2, head sat after block 4; the inserted block
    // now lives inside the boundary span -> covered count grows by one.
    expect(mapped.blockNodes.map((n) => n.textContent)).toEqual([
      "Block 2",
      "Mid",
      "Block 3",
      "Block 4",
    ])
    editor.destroy()
  })
})

describe("MBS characterization — content() slice shape", () => {
  it("openStart === 0 and openEnd === 0 (whole-block slice)", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 1, 3)
    const slice = sel.content()
    expect(slice.openStart).toBe(0)
    expect(slice.openEnd).toBe(0)
    expect(slice.content.childCount).toBe(3)
    expect(slice.content.firstChild?.textContent).toBe("Block 2")
    expect(slice.content.lastChild?.textContent).toBe("Block 4")
    editor.destroy()
  })

  it("N=1 content() is a single whole block", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 0, 0)
    const slice = sel.content()
    expect(slice.openStart).toBe(0)
    expect(slice.openEnd).toBe(0)
    expect(slice.content.childCount).toBe(1)
    editor.destroy()
  })
})

describe("MBS characterization — bookmark resolve", () => {
  it("normal case: resolve restores MBS with the same indices after an upstream insert", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 2, 3) // blocks 3..4
    const bookmark = sel.getBookmark()
    const paragraphType = editor.schema.nodes.paragraph
    if (!paragraphType) throw new Error("paragraph node type missing")
    const tr = editor.state.tr.insert(0, paragraphType.create(null, editor.schema.text("New")))
    const restored = bookmark.map(tr.mapping).resolve(tr.doc)
    expect(restored).toBeInstanceOf(MultiBlockSelection)
    expect((restored as MultiBlockSelection).blockNodes.map((n) => n.textContent)).toEqual([
      "Block 3",
      "Block 4",
    ])
    editor.destroy()
  })

  it("collapse case: anchor-side boundary block deleted -> resolve collapses, not MBS", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 1, 2) // blocks 2..3
    const bookmark = sel.getBookmark()
    const doc = editor.state.doc
    const from = doc.child(0).nodeSize // before block 2
    const to = from + doc.child(1).nodeSize // after block 2
    const tr = editor.state.tr.delete(from, to)
    const restored = bookmark.map(tr.mapping).resolve(tr.doc)
    expect(restored).not.toBeInstanceOf(MultiBlockSelection)
    expect(restored.$head.parent.textContent).toBe("Block 4")
    editor.destroy()
  })

  it("collapse case: head-side boundary deleted -> collapses near surviving anchor", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 1, 2) // blocks 2..3
    const bookmark = sel.getBookmark()
    const doc = editor.state.doc
    const from = doc.child(0).nodeSize + doc.child(1).nodeSize // before block 3
    const to = from + doc.child(2).nodeSize + doc.child(3).nodeSize // after block 4
    const tr = editor.state.tr.delete(from, to)
    const restored = bookmark.map(tr.mapping).resolve(tr.doc)
    expect(restored).not.toBeInstanceOf(MultiBlockSelection)
    expect(restored.$head.parent.textContent).toBe("Block 2")
    editor.destroy()
  })

  it("collapse case: both boundaries deleted -> collapses near $head", () => {
    const editor = makeEditor()
    const sel = MultiBlockSelection.create(editor.state.doc, 1, 2) // blocks 2..3
    const bookmark = sel.getBookmark()
    const doc = editor.state.doc
    const from = doc.child(0).nodeSize // before block 2
    const to = from + doc.child(1).nodeSize + doc.child(2).nodeSize // after block 3
    const tr = editor.state.tr.delete(from, to)
    const restored = bookmark.map(tr.mapping).resolve(tr.doc)
    expect(restored).not.toBeInstanceOf(MultiBlockSelection)
    expect(restored.$head.parent.textContent).toBe("Block 4")
    editor.destroy()
  })
})
