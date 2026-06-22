// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"

import { createTestEditor } from "../test-utils/createTestEditor"
import {
  bodyBlocksInRange,
  forEachBodyBlock,
  nearestBodyBlock,
  resolveBodyBlockById,
} from "./bodySurface"

// A flat doc with three blocks of mixed type. Phase 0 resolves every
// body-surface query against the root surface, so these positions/indices
// are exactly the top-level child positions/indices.
function mkEditor() {
  const editor = createTestEditor()
  editor.commands.setContent([
    { type: "heading", attrs: { level: 2, id: "first" }, content: [{ type: "text", text: "one" }] },
    { type: "paragraph", attrs: { id: "middle" }, content: [{ type: "text", text: "two" }] },
    { type: "codeBlock", attrs: { id: "last" }, content: [{ type: "text", text: "code" }] },
  ])
  return editor
}

// A doc with root blocks bracketing a 2-column columnLayout. Each column
// holds two body blocks so surface-local indices (0,1) are exercised.
// Column ids are explicit (the normalization plugin would backfill nulls,
// but explicit ids keep assertions deterministic).
function mkNestedEditor() {
  const editor = createTestEditor()
  editor.commands.setContent([
    { type: "paragraph", attrs: { id: "root-a" }, content: [{ type: "text", text: "root a" }] },
    {
      type: "columnLayout",
      attrs: { id: "cl", depth: 0 },
      content: [
        {
          type: "column",
          attrs: { id: "colL", width: 1 },
          content: [
            { type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "L0" }] },
            { type: "paragraph", attrs: { id: "L1" }, content: [{ type: "text", text: "L1" }] },
          ],
        },
        {
          type: "column",
          attrs: { id: "colR", width: 1 },
          content: [
            { type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "R0" }] },
            { type: "paragraph", attrs: { id: "R1" }, content: [{ type: "text", text: "R1" }] },
          ],
        },
      ],
    },
    { type: "paragraph", attrs: { id: "root-b" }, content: [{ type: "text", text: "root b" }] },
  ])
  return editor
}

describe("bodySurface", () => {
  describe("resolveBodyBlockById", () => {
    it("returns pos/index/depth on the root surface for an existing id", () => {
      const editor = mkEditor()
      const doc = editor.state.doc

      const first = resolveBodyBlockById(doc, "first")
      expect(first).not.toBeNull()
      expect(first!.id).toBe("first")
      expect(first!.pos).toBe(0)
      expect(first!.indexInSurface).toBe(0)
      expect(first!.depth).toBe(0)
      // -1 marks the root surface; Phase 1 returns the column node's pos.
      expect(first!.surfacePos).toBe(-1)
      expect(first!.node.type.name).toBe("heading")

      const middle = resolveBodyBlockById(doc, "middle")
      expect(middle!.pos).toBe(doc.child(0).nodeSize)
      expect(middle!.indexInSurface).toBe(1)
      expect(middle!.node.type.name).toBe("paragraph")

      const last = resolveBodyBlockById(doc, "last")
      expect(last!.indexInSurface).toBe(2)
      expect(last!.node.type.name).toBe("codeBlock")
    })

    it("reflects the depth attr", () => {
      const editor = createTestEditor()
      editor.commands.setContent([
        { type: "bulletList", attrs: { id: "lead" }, content: [{ type: "text", text: "a" }] },
        { type: "paragraph", attrs: { id: "nested", depth: 1 }, content: [{ type: "text", text: "b" }] },
      ])
      const resolved = resolveBodyBlockById(editor.state.doc, "nested")
      expect(resolved!.depth).toBe(1)
      expect(resolved!.indexInSurface).toBe(1)
    })

    it("returns null for a missing id", () => {
      const editor = mkEditor()
      expect(resolveBodyBlockById(editor.state.doc, "nope")).toBeNull()
    })
  })

  describe("forEachBodyBlock", () => {
    it("visits exactly the root children in doc order", () => {
      const editor = mkEditor()
      const doc = editor.state.doc

      const seen: Array<{ name: string; pos: number; index: number }> = []
      forEachBodyBlock(doc, ({ node, pos, index }) => {
        seen.push({ name: node.type.name, pos, index })
      })

      const expected: Array<{ name: string; pos: number; index: number }> = []
      doc.forEach((node, offset, index) => {
        expected.push({ name: node.type.name, pos: offset, index })
      })

      expect(seen).toEqual(expected)
      expect(seen.map((s) => s.name)).toEqual(["heading", "paragraph", "codeBlock"])
    })
  })

  describe("nearestBodyBlock", () => {
    it("resolves the body block ancestor for a caret inside a paragraph", () => {
      const editor = mkEditor()
      const doc = editor.state.doc
      // a caret inside the paragraph's text
      const paraStart = doc.child(0).nodeSize + 1
      const $pos = doc.resolve(paraStart)

      const block = nearestBodyBlock(editor, $pos)
      expect(block).not.toBeNull()
      expect(block!.node.type.name).toBe("paragraph")
      expect(block!.pos).toBe($pos.before(1))
      expect(block!.indexInSurface).toBe($pos.index(0))
      // matches today's flat behavior
      expect(block!.node).toBe($pos.node(1))
    })

    it("resolves registry body blocks that are not paragraphs (heading, codeBlock)", () => {
      const editor = mkEditor()
      const doc = editor.state.doc

      const headingCaret = doc.resolve(1)
      const heading = nearestBodyBlock(editor, headingCaret)
      expect(heading!.node.type.name).toBe("heading")

      const codeStart = doc.child(0).nodeSize + doc.child(1).nodeSize + 1
      const code = nearestBodyBlock(editor, doc.resolve(codeStart))
      expect(code!.node.type.name).toBe("codeBlock")
    })

    it("uses the block-spec registry, not depth === 1 — resolves a body block through wrapper nodes", () => {
      // A table's caret sits inside tableCell > tableParagraph, which are NOT
      // registered body blocks. nearestBodyBlock must skip those wrappers and
      // return the `table` block (a registry body block), proving it keys off
      // the registry rather than the resolved depth.
      const editor = createTestEditor()
      editor.commands.insertTable({ rows: 2, cols: 2 })
      const doc = editor.state.doc

      let tablePos = -1
      doc.forEach((node, offset) => {
        if (node.type.name === "table") tablePos = offset
      })
      expect(tablePos).toBeGreaterThanOrEqual(0)

      // resolve a caret deep inside the first cell's paragraph
      const inside = doc.resolve(tablePos + 4)
      expect(inside.depth).toBeGreaterThan(1)

      const block = nearestBodyBlock(editor, inside)
      expect(block).not.toBeNull()
      expect(block!.node.type.name).toBe("table")
      expect(block!.pos).toBe(tablePos)
    })

    it("returns null at depth 0", () => {
      const editor = mkEditor()
      const $pos = editor.state.doc.resolve(0)
      expect($pos.depth).toBe(0)
      expect(nearestBodyBlock(editor, $pos)).toBeNull()
    })
  })

  describe("bodyBlocksInRange", () => {
    it("returns the blocks a boundary range overlaps", () => {
      const editor = mkEditor()
      const doc = editor.state.doc

      const from0 = 0
      const size0 = doc.child(0).nodeSize
      const size1 = doc.child(1).nodeSize

      // a range fully inside the first two blocks
      const overlap = bodyBlocksInRange(doc, from0, size0 + size1)
      expect(overlap.map((b) => b.node.type.name)).toEqual(["heading", "paragraph"])
      expect(overlap.map((b) => b.id)).toEqual(["first", "middle"])
      expect(overlap.map((b) => b.pos)).toEqual([0, size0])

      // a zero-width boundary at the start of the paragraph touches no block
      // (boundary guards: offsetEnd <= from skips block 0, offset >= to skips
      // block 1), matching collectTargets' MBS branch.
      const atBoundary = bodyBlocksInRange(doc, size0, size0)
      expect(atBoundary).toEqual([])

      // whole-doc range covers all three
      const all = bodyBlocksInRange(doc, 0, doc.content.size)
      expect(all.map((b) => b.id)).toEqual(["first", "middle", "last"])
    })
  })

  // ---------------------------------------------------------------------
  // Phase 1: nested body surface (columnLayout > column > body blocks)
  // ---------------------------------------------------------------------
  describe("nested column surface", () => {
    it("resolveBodyBlockById finds a column child with surface-local index/depth and real surfacePos", () => {
      const editor = mkNestedEditor()
      const doc = editor.state.doc

      // Root blocks still resolve on the root surface.
      const rootA = resolveBodyBlockById(doc, "root-a")
      expect(rootA!.surfacePos).toBe(-1)
      expect(rootA!.indexInSurface).toBe(0)

      // A column child: surfacePos = the `column` node's pos; index/depth
      // are surface-local (relative to that column's children).
      const l1 = resolveBodyBlockById(doc, "L1")
      expect(l1).not.toBeNull()
      expect(l1!.node.type.name).toBe("paragraph")
      expect(l1!.indexInSurface).toBe(1) // 2nd child of column L
      expect(l1!.depth).toBe(0)

      // surfacePos must be the containing `column` node's absolute pos, and
      // `pos` the block's own absolute pos inside that column.
      const layoutPos = resolveBodyBlockById(doc, "cl")!.pos
      const layout = doc.nodeAt(layoutPos)!
      // column L starts at layoutPos + 1 (inside the layout open token).
      const colLPos = layoutPos + 1
      expect(l1!.surfacePos).toBe(colLPos)
      const colL = doc.nodeAt(colLPos)!
      expect(colL.type.name).toBe("column")
      // L1 is the 2nd child: pos = colLPos + 1 (column open) + first child size.
      expect(l1!.pos).toBe(colLPos + 1 + colL.child(0).nodeSize)
      // sanity: the layout node is the columnLayout.
      expect(layout.type.name).toBe("columnLayout")

      const r0 = resolveBodyBlockById(doc, "R0")
      expect(r0!.indexInSurface).toBe(0)
      const colRPos = colLPos + colL.nodeSize
      expect(r0!.surfacePos).toBe(colRPos)
    })

    it("forEachBodyBlock visits root blocks AND column children in document order; the layout is visited, columns are not, no duplication", () => {
      const editor = mkNestedEditor()
      const doc = editor.state.doc

      const seen: string[] = []
      forEachBodyBlock(doc, ({ node }) => {
        const id = node.attrs.id as string | undefined
        seen.push(`${node.type.name}:${id ?? ""}`)
      })

      // Document order: root-a, the layout itself, then its column children
      // (L0,L1,R0,R1), then root-b. No bare `column` is ever emitted, and the
      // layout's children are NOT also emitted as part of the layout twice.
      expect(seen).toEqual([
        "paragraph:root-a",
        "columnLayout:cl",
        "paragraph:L0",
        "paragraph:L1",
        "paragraph:R0",
        "paragraph:R1",
        "paragraph:root-b",
      ])
      expect(seen.some((s) => s.startsWith("column:"))).toBe(false)
    })

    it("bodyBlocksInRange stays single-surface: same-parent range returns that surface's blocks", () => {
      const editor = mkNestedEditor()
      const doc = editor.state.doc

      // A range whose endpoints both sit inside column L returns the column's
      // blocks only (surface-local), not root blocks.
      const l0 = resolveBodyBlockById(doc, "L0")!
      const l1 = resolveBodyBlockById(doc, "L1")!
      const from = l0.pos
      const to = l1.pos + l1.node.nodeSize
      const inCol = bodyBlocksInRange(doc, from, to)
      expect(inCol.map((b) => b.id)).toEqual(["L0", "L1"])
    })

    it("bodyBlocksInRange returns EMPTY for a cross-surface range (root -> inside a column)", () => {
      const editor = mkNestedEditor()
      const doc = editor.state.doc

      const rootA = resolveBodyBlockById(doc, "root-a")!
      const l0 = resolveBodyBlockById(doc, "L0")!
      // root-a lives on the root surface; L0 inside column L. The endpoints do
      // not share a parent → spec says return empty.
      const cross = bodyBlocksInRange(doc, rootA.pos, l0.pos + l0.node.nodeSize)
      expect(cross).toEqual([])
    })
  })
})
