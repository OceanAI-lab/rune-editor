// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createTestEditor } from "../test-utils/createTestEditor"
import type { IndentConfig } from "../schema/blocks/createSpec"
import { normalizeDepthAt } from "./depth"

/**
 * Build a flat doc of paragraphs with the given depths, all carrying ids.
 * Returns the editor and a helper to get the boundary position before the
 * block at a given index (the insertion destination for a block that will
 * become the sibling at that index), plus `endPos` for "after the last
 * block".
 */
function docWithDepths(depths: number[]): {
  doc: ProseMirrorNode
  posBeforeIndex: (index: number) => number
  endPos: number
} {
  const editor = createTestEditor({ kit: { suggestionMenus: false } })
  editor.commands.setContent({
    type: "doc",
    content: depths.map((depth, i) => ({
      type: "paragraph",
      attrs: { id: `p${i}`, depth },
      content: [{ type: "text", text: `block ${i}` }],
    })),
  })
  const doc = editor.state.doc
  const posBeforeIndex = (index: number): number => {
    let pos = 0
    doc.forEach((child, offset, idx) => {
      if (idx === index) pos = offset
    })
    return pos
  }
  return { doc, posBeforeIndex, endPos: doc.content.size }
}

const FOLLOW_PREV: IndentConfig = { mode: "follow-prev" }

describe("normalizeDepthAt", () => {
  it("clamps negative requestedDepth to 0", () => {
    const { doc, endPos } = docWithDepths([0])
    expect(normalizeDepthAt(doc, endPos, -3, FOLLOW_PREV)).toBe(0)
  })

  it("returns 0 when there is no previous sibling (lone block can't indent)", () => {
    const { doc, posBeforeIndex } = docWithDepths([0])
    // Inserting at the very start: no previous sibling -> cap = (-1)+1 = 0.
    expect(normalizeDepthAt(doc, posBeforeIndex(0), 5, FOLLOW_PREV)).toBe(0)
  })

  it("caps follow-prev at immediatelyPrevDepth + 1", () => {
    // [d0, d0] -> inserting after the first (index 1) prev depth = 0, cap = 1.
    const { doc, posBeforeIndex } = docWithDepths([0, 0])
    expect(normalizeDepthAt(doc, posBeforeIndex(1), 5, FOLLOW_PREV)).toBe(1)
  })

  it("caps follow-prev relative to a deeper previous sibling", () => {
    // prev depth = 2 -> cap = 3.
    const { doc, endPos } = docWithDepths([0, 1, 2])
    expect(normalizeDepthAt(doc, endPos, 9, FOLLOW_PREV)).toBe(3)
  })

  it("returns requestedDepth unchanged when already legal (follow-prev)", () => {
    const { doc, endPos } = docWithDepths([0, 1, 2])
    // cap = 3; requesting 2 is legal.
    expect(normalizeDepthAt(doc, endPos, 2, FOLLOW_PREV)).toBe(2)
  })

  it("respects mode: numeric maxDepth", () => {
    // Even though follow-prev cap would allow 3, numeric maxDepth=1 wins.
    const { doc, endPos } = docWithDepths([0, 1, 2])
    expect(normalizeDepthAt(doc, endPos, 9, { mode: "numeric", maxDepth: 1 })).toBe(1)
  })

  it("numeric maxDepth=0 forces depth 0 (non-indentable blocks)", () => {
    const { doc, endPos } = docWithDepths([0, 1, 2])
    expect(normalizeDepthAt(doc, endPos, 5, { mode: "numeric", maxDepth: 0 })).toBe(0)
  })

  it("numeric returns requestedDepth unchanged when within maxDepth", () => {
    const { doc, endPos } = docWithDepths([0, 1, 2])
    expect(normalizeDepthAt(doc, endPos, 1, { mode: "numeric", maxDepth: 3 })).toBe(1)
  })

  it("structural is treated like follow-prev for clamping (cap at prev+1)", () => {
    // Indent currently gates structural on a same-kind predecessor at TAB
    // time; for destination clamping there is no per-mode rule beyond the
    // follow-prev cap, so structural clamps the same way.
    const { doc, endPos } = docWithDepths([0, 1, 2])
    expect(normalizeDepthAt(doc, endPos, 9, { mode: "structural" })).toBe(3)
  })

  it("absent spec defaults to follow-prev clamping", () => {
    const { doc, endPos } = docWithDepths([0, 1, 2])
    expect(normalizeDepthAt(doc, endPos, 9, undefined)).toBe(3)
  })
})
