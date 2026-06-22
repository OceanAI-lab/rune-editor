// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { createTestEditor } from "../test-utils/createTestEditor"
import { getBlockOutline } from "./queries/blockSnapshots"
import { posAtBlockOffset, setInlineMark } from "./inlineMark"

function seed(html = "<p>hello world</p>"): Editor {
  const editor = createTestEditor()
  editor.commands.setContent(html)
  return editor
}

function firstBlockId(editor: Editor): string {
  return getBlockOutline(editor)[0]!.id
}

/** Marks on the text node covering block-local char `charIndex`. */
function marksAtChar(editor: Editor, blockId: string, charIndex: number) {
  const doc = editor.state.doc
  const pos = posAtBlockOffset(doc, blockId, charIndex)
  if (pos === null) return []
  return doc.nodeAt(pos)?.marks ?? []
}

function hasMark(editor: Editor, blockId: string, charIndex: number, name: string): boolean {
  return marksAtChar(editor, blockId, charIndex).some((m) => m.type.name === name)
}

function attrsOf(editor: Editor, blockId: string, charIndex: number, name: string) {
  return marksAtChar(editor, blockId, charIndex).find((m) => m.type.name === name)?.attrs
}

describe("posAtBlockOffset", () => {
  it("round-trips with the read model's block-local offsets", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    const doc = editor.state.doc
    // The block sits at pos 0; its text content starts at pos 1. Each char maps
    // to one position under the read model's "\n"-separated textBetween.
    expect(posAtBlockOffset(doc, id, 0)).toBe(1)
    expect(posAtBlockOffset(doc, id, 5)).toBe(6)
    expect(posAtBlockOffset(doc, id, 11)).toBe(12) // end of "hello world"
  })

  it("returns null past the block's text length and for unknown ids", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    const doc = editor.state.doc
    expect(posAtBlockOffset(doc, id, 12)).toBeNull() // one past "hello world"
    expect(posAtBlockOffset(doc, "nope", 0)).toBeNull()
  })

  // Parity guard (#5): posAtBlockOffset is the INVERSE of selection.ts's private
  // `textOffset` — both must share the exact `textBetween(.., "\n", "\n")`
  // walk or read- and write-addressing silently desync. Pin the round-trip: the
  // position posAtBlockOffset returns for offset `o` must have a read-model
  // prefix length of exactly `o`.
  it("round-trips: the resolved position's read-model prefix length equals the offset", () => {
    for (const html of ["<p>hello world</p>", "<p><b>AAA</b>BBB</p>", "<p>x</p>"]) {
      const editor = seed(html)
      const id = firstBlockId(editor)
      const doc = editor.state.doc
      const contentStart = 1
      const textLen = doc.textBetween(contentStart, doc.firstChild!.nodeSize - 1, "\n", "\n").length
      for (let o = 0; o <= textLen; o++) {
        const pos = posAtBlockOffset(doc, id, o)
        expect(pos, `offset ${o} of ${html}`).not.toBeNull()
        expect(doc.textBetween(contentStart, pos!, "\n", "\n").length, `offset ${o} of ${html}`).toBe(o)
      }
    }
  })

  // Equivalence guard (#2): the O(n) accumulating walk must return byte-identical
  // results to the original O(n²) "recompute textBetween(start, pos) each step"
  // form, including the multi-text-node case and out-of-bounds offsets.
  it("matches the O(n²) reference across multi-node blocks and out-of-bounds offsets", () => {
    const refPosAtOffset = (doc: PMNode, offset: number): number | null => {
      const contentStart = 1
      const contentEnd = doc.firstChild!.nodeSize - 1
      if (!Number.isInteger(offset) || offset < 0) return null
      if (contentEnd < contentStart) return offset === 0 ? contentStart : null
      for (let pos = contentStart; pos <= contentEnd; pos++) {
        if (doc.textBetween(contentStart, pos, "\n", "\n").length >= offset) return pos
      }
      return null
    }
    for (const html of ["<p>hello world</p>", "<p><b>AAA</b>BBB</p>", "<p></p>", "<p>a</p>"]) {
      const editor = seed(html)
      const id = firstBlockId(editor)
      const doc = editor.state.doc
      for (let o = 0; o <= 15; o++) {
        expect(posAtBlockOffset(doc, id, o), `offset ${o} of ${html}`).toBe(refPosAtOffset(doc, o))
      }
    }
  })
})

describe("setInlineMark", () => {
  it("bolds exactly the addressed range, nothing outside it", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    const res = setInlineMark(editor, { blockId: id, from: 0, to: 5, mark: "bold" })
    expect(res.ok).toBe(true)
    expect(hasMark(editor, id, 0, "bold")).toBe(true)
    expect(hasMark(editor, id, 4, "bold")).toBe(true)
    expect(hasMark(editor, id, 5, "bold")).toBe(false) // the space
    expect(hasMark(editor, id, 6, "bold")).toBe(false) // "world"
  })

  it("unset removes the mark over the range", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    setInlineMark(editor, { blockId: id, from: 0, to: 5, mark: "bold" })
    const res = setInlineMark(editor, { blockId: id, from: 0, to: 5, mark: "bold", unset: true })
    expect(res.ok).toBe(true)
    expect(hasMark(editor, id, 0, "bold")).toBe(false)
  })

  it("applies link with an href attr", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    const res = setInlineMark(editor, {
      blockId: id,
      from: 0,
      to: 5,
      mark: "link",
      attrs: { href: "https://example.com" },
    })
    expect(res.ok).toBe(true)
    expect(attrsOf(editor, id, 0, "link")?.href).toBe("https://example.com")
  })

  it("applies a textStyle colour and merges instead of clobbering the other axis", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    setInlineMark(editor, {
      blockId: id,
      from: 0,
      to: 5,
      mark: "textStyle",
      attrs: { backgroundColor: "red" },
    })
    setInlineMark(editor, {
      blockId: id,
      from: 0,
      to: 5,
      mark: "textStyle",
      attrs: { textColor: "blue" },
    })
    const attrs = attrsOf(editor, id, 0, "textStyle")
    expect(attrs?.textColor).toBe("blue")
    expect(attrs?.backgroundColor).toBe("red") // not wiped by the second call
  })

  // Regression: the merge must be PER NODE, not a single sample at the range
  // start. A uniform range (the test above) can't catch a start-char smear —
  // these use NON-uniform ranges where the start char's attrs differ from the
  // rest, which the single-sample form wrongly broadcast across the whole range.
  it("does not smear the start char's attrs across a wider range (single mark)", () => {
    const editor = seed() // "hello world"
    const id = firstBlockId(editor)
    // bg=red only on "he" (0..2), then textColor=blue over the WHOLE word.
    setInlineMark(editor, { blockId: id, from: 0, to: 2, mark: "textStyle", attrs: { backgroundColor: "red" } })
    setInlineMark(editor, { blockId: id, from: 0, to: 11, mark: "textStyle", attrs: { textColor: "blue" } })

    // Start char keeps both; a char past offset 2 gets blue but NOT red.
    expect(attrsOf(editor, id, 0, "textStyle")?.backgroundColor).toBe("red")
    expect(attrsOf(editor, id, 0, "textStyle")?.textColor).toBe("blue")
    expect(attrsOf(editor, id, 8, "textStyle")?.textColor).toBe("blue")
    expect(attrsOf(editor, id, 8, "textStyle")?.backgroundColor ?? null).toBe(null)
  })

  it("preserves each node's own attrs when formatting across differing runs", () => {
    const editor = seed("<p>AAABBB</p>")
    const id = firstBlockId(editor)
    setInlineMark(editor, { blockId: id, from: 0, to: 3, mark: "textStyle", attrs: { backgroundColor: "red" } })
    setInlineMark(editor, { blockId: id, from: 3, to: 6, mark: "textStyle", attrs: { backgroundColor: "green" } })
    // Apply a NEW axis over both runs: each keeps its own bg, both get blue.
    setInlineMark(editor, { blockId: id, from: 0, to: 6, mark: "textStyle", attrs: { textColor: "blue" } })

    expect(attrsOf(editor, id, 0, "textStyle")?.backgroundColor).toBe("red")
    expect(attrsOf(editor, id, 3, "textStyle")?.backgroundColor).toBe("green") // NOT clobbered to red
    expect(attrsOf(editor, id, 0, "textStyle")?.textColor).toBe("blue")
    expect(attrsOf(editor, id, 3, "textStyle")?.textColor).toBe("blue")
  })

  it("is one undo step", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    setInlineMark(editor, { blockId: id, from: 0, to: 5, mark: "bold" })
    expect(hasMark(editor, id, 0, "bold")).toBe(true)
    editor.commands.undo()
    expect(hasMark(editor, id, 0, "bold")).toBe(false)
  })

  describe("the expect echo (D6)", () => {
    it("applies when expect matches the range text", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      const res = setInlineMark(editor, {
        blockId: id,
        from: 0,
        to: 5,
        mark: "bold",
        expect: "hello",
      })
      expect(res.ok).toBe(true)
      expect(hasMark(editor, id, 0, "bold")).toBe(true)
    })

    it("rejects with invalid-input and no mutation when expect mismatches", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      const res = setInlineMark(editor, {
        blockId: id,
        from: 0,
        to: 5,
        mark: "bold",
        expect: "world", // actual range text is "hello"
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("invalid-input")
      expect(hasMark(editor, id, 0, "bold")).toBe(false)
    })
  })

  describe("error gating", () => {
    it("unknown mark -> unsupported", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      const res = setInlineMark(editor, { blockId: id, from: 0, to: 5, mark: "sparkle" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("unsupported")
    })

    it("missing block -> not-found", () => {
      const editor = seed()
      const res = setInlineMark(editor, { blockId: "nope", from: 0, to: 1, mark: "bold" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("not-found")
    })

    it("out-of-range offset -> invalid-input", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      const res = setInlineMark(editor, { blockId: id, from: 0, to: 999, mark: "bold" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("invalid-input")
    })

    it("inverted / empty range -> invalid-input", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      expect(setInlineMark(editor, { blockId: id, from: 5, to: 5, mark: "bold" }).ok).toBe(false)
      expect(setInlineMark(editor, { blockId: id, from: 5, to: 2, mark: "bold" }).ok).toBe(false)
    })

    it("non-textblock target -> unsupported", () => {
      const editor = seed()
      editor.commands.insertBlocks([{ type: "divider" }], { at: "end" })
      const dividerId = getBlockOutline(editor).find((b) => b.type === "divider")!.id
      const res = setInlineMark(editor, { blockId: dividerId, from: 0, to: 1, mark: "bold" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("unsupported")
    })

    it("readonly editor -> not-editable", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      editor.setEditable(false)
      const res = setInlineMark(editor, { blockId: id, from: 0, to: 5, mark: "bold" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("not-editable")
    })
  })
})
