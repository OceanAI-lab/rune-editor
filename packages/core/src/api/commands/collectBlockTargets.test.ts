// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { collectBlockTargets } from "./collectBlockTargets"

function docWithBlocks(
  blocks: { type: string; id?: string; depth?: number; text?: string }[],
) {
  return {
    type: "doc" as const,
    content: blocks.map((b, i) => ({
      type: b.type,
      attrs: { id: b.id ?? `b${i}`, depth: b.depth ?? 0 },
      content: b.text != null ? [{ type: "text", text: b.text }] : [],
    })),
  }
}

/**
 * `collectBlockTargets` is the de-duplicated resolver shared by `indentBlock`
 * and `outdentBlock`. These tests pin the resolver's output against EXPLICIT
 * expected block ids and positions for each selection branch (explicit id,
 * MultiBlockSelection range, caret). A wrong target — bad id, wrong pos, wrong
 * set — causes a real failure here.
 *
 * Position arithmetic for a flat PM doc: each block's pos equals the sum of
 * preceding blocks' nodeSizes. A paragraph node's nodeSize is
 * 1 (open token) + text.length + 1 (close token).
 */
describe("collectBlockTargets", () => {
  function setup(
    blocks: { type: string; id?: string; depth?: number; text?: string }[],
  ) {
    const editor = createTestEditor({
      kit: { suggestionMenus: false },
      content: docWithBlocks(blocks) as never,
    })
    return editor
  }

  /**
   * Compute the absolute PM position of the block at a given 0-based child
   * index in a flat doc (doc.child(i) equivalent via accumulated nodeSize).
   */
  function blockPosAt(
    editor: ReturnType<typeof setup>,
    index: number,
  ): number {
    let pos = 0
    for (let i = 0; i < index; i++) {
      pos += editor.state.doc.child(i).nodeSize
    }
    return pos
  }

  it("explicit id → single block with correct id and pos", () => {
    const editor = setup([
      { type: "paragraph", id: "p1", text: "one" },
      { type: "paragraph", id: "p2", text: "two" },
    ])
    const p2Pos = blockPosAt(editor, 1)
    const targets = collectBlockTargets(editor, editor.state.selection, "p2")
    expect(targets).toHaveLength(1)
    expect(targets[0]!.id).toBe("p2")
    expect(targets[0]!.pos).toBe(p2Pos)
  })

  it("explicit id targets first block when that block is specified", () => {
    const editor = setup([
      { type: "paragraph", id: "p1", text: "one" },
      { type: "paragraph", id: "p2", text: "two" },
    ])
    const p1Pos = blockPosAt(editor, 0) // pos 0
    const targets = collectBlockTargets(editor, editor.state.selection, "p1")
    expect(targets).toHaveLength(1)
    expect(targets[0]!.id).toBe("p1")
    expect(targets[0]!.pos).toBe(p1Pos)
  })

  it("explicit id with no match → empty set", () => {
    const editor = setup([{ type: "paragraph", id: "p1", text: "one" }])
    expect(collectBlockTargets(editor, editor.state.selection, "nope")).toEqual([])
  })

  it("MBS range covering all blocks → every block in order with correct ids and positions", () => {
    const editor = setup([
      { type: "paragraph", id: "p1", text: "one" },
      { type: "paragraph", id: "p2", text: "two" },
      { type: "paragraph", id: "p3", text: "three" },
    ])
    const p1Pos = blockPosAt(editor, 0)
    const p2Pos = blockPosAt(editor, 1)
    const p3Pos = blockPosAt(editor, 2)
    editor.commands.setBlockSelection({ from: "p1", to: "p3" })
    const targets = collectBlockTargets(editor, editor.state.selection, undefined)
    expect(targets).toHaveLength(3)
    expect(targets.map((t) => ({ id: t.id, pos: t.pos }))).toEqual([
      { id: "p1", pos: p1Pos },
      { id: "p2", pos: p2Pos },
      { id: "p3", pos: p3Pos },
    ])
  })

  it("MBS sub-range → only overlapped blocks with correct ids and positions", () => {
    const editor = setup([
      { type: "paragraph", id: "p1", text: "one" },
      { type: "paragraph", id: "p2", text: "two" },
      { type: "paragraph", id: "p3", text: "three" },
    ])
    const p2Pos = blockPosAt(editor, 1)
    const p3Pos = blockPosAt(editor, 2)
    editor.commands.setBlockSelection({ from: "p2", to: "p3" })
    const targets = collectBlockTargets(editor, editor.state.selection, undefined)
    expect(targets).toHaveLength(2)
    expect(targets.map((t) => ({ id: t.id, pos: t.pos }))).toEqual([
      { id: "p2", pos: p2Pos },
      { id: "p3", pos: p3Pos },
    ])
    // p1 must NOT be in the result
    expect(targets.find((t) => t.id === "p1")).toBeUndefined()
  })

  it("caret in second block → returns that block with correct id and pos", () => {
    const editor = setup([
      { type: "paragraph", id: "p1", text: "one" },
      { type: "paragraph", id: "p2", text: "hello" },
    ])
    const p2Pos = blockPosAt(editor, 1)
    // Place caret inside p2's text content (p2Pos is the node's position;
    // p2Pos + 1 is the first text position inside it)
    editor.commands.setTextSelection(p2Pos + 1)
    const targets = collectBlockTargets(editor, editor.state.selection, undefined)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.id).toBe("p2")
    expect(targets[0]!.pos).toBe(p2Pos)
  })

  it("caret in first block → returns that block, not any other", () => {
    const editor = setup([
      { type: "paragraph", id: "p1", text: "first" },
      { type: "paragraph", id: "p2", text: "second" },
    ])
    const p1Pos = blockPosAt(editor, 0) // 0
    // Default selection is in the first block; place caret explicitly at p1+1
    editor.commands.setTextSelection(p1Pos + 1)
    const targets = collectBlockTargets(editor, editor.state.selection, undefined)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.id).toBe("p1")
    expect(targets[0]!.pos).toBe(p1Pos)
  })

  it("caret in a list block resolves to that block", () => {
    const editor = setup([{ type: "bulletList", id: "b1", text: "item" }])
    editor.commands.setTextSelection(2)
    const targets = collectBlockTargets(editor, editor.state.selection, undefined)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.id).toBe("b1")
    expect(targets[0]!.pos).toBe(0)
  })
})
