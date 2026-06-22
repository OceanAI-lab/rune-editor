// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { slotAtY, refreshSnapshotRects, snapshotBlocks, effectivePrevIndex } from "./block-drag-geometry"
import type { BlockGeom, BlocksSnapshot } from "./types"
import type { EditorView } from "@tiptap/pm/view"
import { createBlockSpec } from "../../schema"

function blk(top: number, bottom: number, pos = 0): BlockGeom {
  return {
    pos,
    nodeSize: 0,
    type: "paragraph",
    depth: 0,
    top,
    bottom,
    left: 0,
    indicatorLeft: 0,
    width: 100,
    marginTop: 0,
    marginBottom: 0,
  }
}

describe("slotAtY", () => {
  const blocks: BlockGeom[] = [
    blk(0, 20),     // index 0
    blk(40, 60),    // index 1
    blk(80, 100),   // index 2
    blk(120, 140),  // index 3
  ]

  it("single-source band: cursor inside source's vertical range, above center → returns lo", () => {
    // blocks[1] = (40, 60), center = 50. y = 45 sits inside the source's
    // vertical range and above its center → source-aware skip fires.
    expect(slotAtY(blocks, 45, { lo: 1, hi: 1 })).toBe(1)
  })

  it("cursor above all blocks (outside any source band) → returns 0", () => {
    expect(slotAtY(blocks, 5, { lo: 1, hi: 1 })).toBe(0)
  })

  it("single-source band: cursor below source center → falls through", () => {
    expect(slotAtY(blocks, 60, { lo: 1, hi: 1 })).toBe(2)
  })

  it("multi-source band [1..2]: cursor inside band, above lo center → returns lo", () => {
    // Source spans indices 1, 2. Cursor at y=15 is above index 1's center (50);
    // current source-aware behavior says "above source center → return lo".
    expect(slotAtY(blocks, 15, { lo: 1, hi: 2 })).toBe(1)
  })

  it("multi-source band [1..2]: cursor inside band, below hi center → falls through past hi", () => {
    // Cursor at y=95 is below index 2's center (90) → fall through to index 3.
    expect(slotAtY(blocks, 95, { lo: 1, hi: 2 })).toBe(3)
  })

  it("multi-source band [1..2]: cursor outside band (below all) → blocks.length", () => {
    expect(slotAtY(blocks, 200, { lo: 1, hi: 2 })).toBe(blocks.length)
  })

  it("multi-source band [1..2]: cursor before first non-source block above the band → returns 0", () => {
    expect(slotAtY(blocks, -5, { lo: 1, hi: 2 })).toBe(0)
  })

  it("multi-source band covers all blocks → cursor falls through to blocks.length", () => {
    // No non-source slot exists, so slotAtY falls through past every block.
    // The "drop is a no-op" semantic for full-band drag lives at the gesture
    // layer: gesture.ts's hide-indicator gate (targetIdx >= fromIdxLo &&
    // targetIdx <= fromIdxHi + 1) treats blocks.length === fromIdxHi + 1 as
    // "in band" and hides the indicator. executeReorder additionally rejects
    // any drop where insertPos lands inside [source.from, source.to].
    expect(slotAtY(blocks, 70, { lo: 0, hi: 3 })).toBe(blocks.length)
  })
})

describe("refreshSnapshotRects", () => {
  function mockViewWith(
    rectsByPos: Record<number, DOMRect | null>,
    indicatorLeftsByPos: Record<number, number> = {},
  ): EditorView {
    return {
      nodeDOM(pos: number) {
        const rect = rectsByPos[pos]
        if (rect === undefined || rect === null) return null
        const el = document.createElement("div")
        el.getBoundingClientRect = () => rect
        const indicatorLeft = indicatorLeftsByPos[pos]
        if (indicatorLeft !== undefined) {
          const content = document.createElement("div")
          content.className = "rune-block-content"
          content.getBoundingClientRect = () => rectAt(rect.top, indicatorLeft, 10, rect.height)
          el.append(content)
        }
        return el
      },
    } as unknown as EditorView
  }

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

  it("rewrites top/bottom/left/width from current rects and recomputes minLeft/maxRight", () => {
    const view = mockViewWith(
      {
        0: rectAt(50, 10, 100, 30),
        5: rectAt(90, 12, 96, 40),
      },
      { 5: 42 },
    )

    const snapshot: BlocksSnapshot = {
      blocks: [
        { ...blk(0, 30), pos: 0 },
        { ...blk(40, 80), pos: 5 },
      ],
      minLeft: 0,
      maxRight: 100,
      indentStepPx: 30,
    }

    refreshSnapshotRects(view, snapshot)

    expect(snapshot.blocks[0]).toMatchObject({ top: 50, bottom: 80, left: 10, width: 100 })
    expect(snapshot.blocks[1]).toMatchObject({ top: 90, bottom: 130, left: 12, indicatorLeft: 42, width: 96 })
    expect(snapshot.minLeft).toBe(10)
    expect(snapshot.maxRight).toBe(110)
  })

  it("leaves a block untouched if its DOM is missing (mid-drag tx removed it)", () => {
    const view = mockViewWith({
      0: rectAt(5, 0, 100, 20),
      5: null,
    })

    const snapshot: BlocksSnapshot = {
      blocks: [
        { ...blk(0, 10), pos: 0 },
        { ...blk(20, 50), pos: 5 },
      ],
      minLeft: 0,
      maxRight: 100,
      indentStepPx: 30,
    }

    refreshSnapshotRects(view, snapshot)

    expect(snapshot.blocks[0]).toMatchObject({ top: 5, bottom: 25 })
    // Untouched: stale values preserved rather than zeroed.
    expect(snapshot.blocks[1]).toMatchObject({ top: 20, bottom: 50 })
    // minLeft/maxRight still account for the stale block so the indicator
    // band doesn't visibly jump.
    expect(snapshot.minLeft).toBe(0)
    expect(snapshot.maxRight).toBe(100)
  })
})

describe("snapshotBlocks", () => {
  const ListBlock = createBlockSpec({
    type: "listItem",
    content: "inline*",
    indent: { mode: "structural" },
    sideMenu: { draggable: true },
    parseDOM: [{ tag: "p" }],
    renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
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

  it("captures each draggable block's depth attribute", () => {
    const editor = new Editor({
      extensions: [Document, Text, ListBlock],
      content: `
        <p>one</p>
        <p data-depth="1">two</p>
      `,
    })
    const rectsByPos = new Map<number, DOMRect>()
    const indicatorLeftsByPos = new Map<number, number>()
    editor.state.doc.forEach((_node, pos, index) => {
      const left = index * 10
      rectsByPos.set(pos, rectAt(index * 30, left, 100, 20))
      indicatorLeftsByPos.set(pos, left + index * 20)
    })
    const originalNodeDOM = editor.view.nodeDOM.bind(editor.view)
    editor.view.nodeDOM = ((pos: number) => {
      const blockRect = rectsByPos.get(pos)
      if (!blockRect) return originalNodeDOM(pos)
      const el = document.createElement("p")
      el.getBoundingClientRect = () => blockRect
      const content = document.createElement("span")
      content.className = "rune-block-content"
      content.getBoundingClientRect = () =>
        rectAt(blockRect.top, indicatorLeftsByPos.get(pos) ?? blockRect.left, 10, blockRect.height)
      el.append(content)
      return el
    }) as EditorView["nodeDOM"]

    const snapshot = snapshotBlocks(editor.view, editor)

    expect(snapshot.blocks).toHaveLength(2)
    expect(snapshot.blocks[1]).toMatchObject({ type: "listItem", depth: 1, indicatorLeft: 30 })
    editor.destroy()
  })

  it("captures the editor indent step once for drag depth picking", () => {
    const editor = new Editor({
      extensions: [Document, Text, ListBlock],
      content: `<p>one</p>`,
    })

    const editorRoot = document.createElement("div")
    editorRoot.className = "rune-editor"
    editorRoot.style.setProperty("--rune-block-indent-step", "30px")
    document.body.append(editorRoot)
    editorRoot.append(editor.view.dom)

    const rectsByPos = new Map<number, DOMRect>()
    editor.state.doc.forEach((_node, pos, index) => {
      rectsByPos.set(pos, rectAt(index * 30, 10, 100, 20))
    })

    const originalNodeDOM = editor.view.nodeDOM.bind(editor.view)
    editor.view.nodeDOM = ((pos: number) => {
      const blockRect = rectsByPos.get(pos)
      if (!blockRect) return originalNodeDOM(pos)
      const el = document.createElement("p")
      el.getBoundingClientRect = () => blockRect
      return el
    }) as EditorView["nodeDOM"]

    const snapshot = snapshotBlocks(editor.view, editor)

    expect(snapshot.indentStepPx).toBe(30)
    editor.destroy()
    editorRoot.remove()
  })
})

describe("effectivePrevIndex", () => {
  it("returns targetIdx - 1 for slots outside the source band", () => {
    expect(effectivePrevIndex(5, { lo: 2, hi: 2 })).toBe(4)
    expect(effectivePrevIndex(0, { lo: 2, hi: 2 })).toBe(-1)
    expect(effectivePrevIndex(2, { lo: 5, hi: 7 })).toBe(1)
  })

  it("returns lo - 1 for the slot just below the source band", () => {
    expect(effectivePrevIndex(3, { lo: 2, hi: 2 })).toBe(1)
    expect(effectivePrevIndex(8, { lo: 5, hi: 7 })).toBe(4)
  })

  it("returns lo - 1 for the slot above source", () => {
    expect(effectivePrevIndex(2, { lo: 2, hi: 2 })).toBe(1)
    expect(effectivePrevIndex(5, { lo: 5, hi: 7 })).toBe(4)
  })

  it("returns -1 when source is at the very top", () => {
    expect(effectivePrevIndex(0, { lo: 0, hi: 0 })).toBe(-1)
    expect(effectivePrevIndex(1, { lo: 0, hi: 0 })).toBe(-1)
  })
})
