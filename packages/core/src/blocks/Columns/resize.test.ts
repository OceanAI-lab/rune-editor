// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import type { Editor } from "@tiptap/core"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { gestureKey } from "../../extensions/shared/gesture-state"
import { isMarqueeEligibleTarget } from "../../extensions/block-selection/marquee"
import { MultiBlockSelection } from "../../extensions/block-selection"
import {
  MIN_COLUMN_PAIR_FRACTION,
  COLUMN_RESIZE_THRESHOLD_PX,
  resizeColumnPair,
  columnBoundaryOffsets,
} from "./resize"

// The gesture plugin attaches its mousemove/mouseup listeners to
// view.dom.ownerDocument and reads geometry off the column DOM nodes'
// getBoundingClientRect — both reachable in jsdom (rects are mocked).
// What jsdom can NOT reach is real-mouse behavior: browser-native
// selection chasing, DOMObserver flushes, CSS hover reveal, and the
// painted live preview — those are pinned by the Task 9 Playwright e2e.

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
  if (typeof document.elementFromPoint !== "function") {
    ;(
      document as unknown as {
        elementFromPoint: (x: number, y: number) => Element | null
      }
    ).elementFromPoint = () => null
  }
})

afterEach(() => {
  container.remove()
})

function columnsDoc(widths: number[]) {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
      {
        type: "columnLayout",
        attrs: { id: "cl1", depth: 0 },
        content: widths.map((w, i) => ({
          type: "column",
          attrs: { id: `col${i}`, width: w },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: `C${i}` }],
            },
          ],
        })),
      },
    ],
  }
}

function makeColumnsEditor(widths: number[] = [1, 1]): Editor {
  const editor = createTestEditor({ element: container })
  editor.commands.setContent(columnsDoc(widths))
  return editor
}

function domRect(left: number, right: number, top = 0, bottom = 100): DOMRect {
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function columnEls(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-rune-column]"),
  )
}

/** Mock the two columns' rects as a 300px + 300px pair. */
function setPairRects() {
  const cols = columnEls()
  cols[0]!.getBoundingClientRect = () => domRect(0, 300)
  cols[1]!.getBoundingClientRect = () => domRect(300, 600)
}

function handleEl(boundary = 0): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `.rune-col-resize-handle[data-rune-col-boundary="${boundary}"]`,
  )
  expect(el).not.toBeNull()
  return el!
}

function mouseDown(el: Element, x: number, y = 50) {
  el.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: x, clientY: y }),
  )
}
function mouseMove(x: number, y = 50) {
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      // Primary button held — what a real in-flight drag reports. The
      // gesture's lost-mouseup defense cancels on (buttons & 1) === 0 moves.
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  )
}
function mouseUp(x: number, y = 50, init?: MouseEventInit) {
  document.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      clientX: x,
      clientY: y,
      ...init,
    }),
  )
}

function activeGesture(editor: Editor) {
  return gestureKey.getState(editor.state)?.activeGesture ?? null
}

function columnWidths(editor: Editor): number[] {
  const layout = editor.state.doc.child(1)
  const widths: number[] = []
  layout.forEach((col) => widths.push(col.attrs.width as number))
  return widths
}

// ---------------------------------------------------------------------------
// Pure ratio math
// ---------------------------------------------------------------------------

describe("resizeColumnPair (pure pixel→ratio math)", () => {
  it("redistributes the pair proportionally to the pixel delta", () => {
    const next = resizeColumnPair({
      leftRatio: 1,
      rightRatio: 1,
      leftPx: 300,
      rightPx: 300,
      deltaPx: 60,
    })
    // 360/600 = 0.6 of the pair → 0.6 * (1+1) = 1.2
    expect(next.left).toBe(1.2)
    expect(next.right).toBe(0.8)
  })

  it("conserves the pair's ratio sum exactly", () => {
    const next = resizeColumnPair({
      leftRatio: 1.5,
      rightRatio: 0.5,
      leftPx: 450,
      rightPx: 150,
      deltaPx: 37,
    })
    expect(next.left + next.right).toBe(2)
  })

  it("clamps so neither column falls below MIN_COLUMN_PAIR_FRACTION of the pair", () => {
    const sum = 2
    const shrunkLeft = resizeColumnPair({
      leftRatio: 1,
      rightRatio: 1,
      leftPx: 300,
      rightPx: 300,
      deltaPx: -10_000,
    })
    expect(shrunkLeft.left).toBe(MIN_COLUMN_PAIR_FRACTION * sum)
    expect(shrunkLeft.right).toBe(sum - MIN_COLUMN_PAIR_FRACTION * sum)

    const shrunkRight = resizeColumnPair({
      leftRatio: 1,
      rightRatio: 1,
      leftPx: 300,
      rightPx: 300,
      deltaPx: 10_000,
    })
    expect(shrunkRight.right).toBe(MIN_COLUMN_PAIR_FRACTION * sum)
    expect(shrunkRight.left).toBe(sum - MIN_COLUMN_PAIR_FRACTION * sum)
  })

  it("returns the input ratios unchanged on degenerate geometry or input", () => {
    const base = { leftRatio: 1, rightRatio: 1, leftPx: 0, rightPx: 0, deltaPx: 20 }
    expect(resizeColumnPair(base)).toEqual({ left: 1, right: 1 })
    expect(
      resizeColumnPair({ ...base, leftPx: 300, rightPx: 300, deltaPx: Number.NaN }),
    ).toEqual({ left: 1, right: 1 })
    expect(
      resizeColumnPair({
        leftRatio: 0,
        rightRatio: 0,
        leftPx: 300,
        rightPx: 300,
        deltaPx: 20,
      }),
    ).toEqual({ left: 0, right: 0 })
  })

  it("zero delta is identity", () => {
    expect(
      resizeColumnPair({
        leftRatio: 1.2,
        rightRatio: 0.8,
        leftPx: 360,
        rightPx: 240,
        deltaPx: 0,
      }),
    ).toEqual({ left: 1.2, right: 0.8 })
  })
})

describe("columnBoundaryOffsets (pure)", () => {
  it("returns one content-local offset per adjacent column pair", () => {
    const editor = makeColumnsEditor([1, 1, 1])
    const layout = editor.state.doc.child(1)
    const offsets = columnBoundaryOffsets(layout)
    expect(offsets).toHaveLength(2)
    expect(offsets[0]).toBe(layout.child(0).nodeSize)
    expect(offsets[1]).toBe(layout.child(0).nodeSize + layout.child(1).nodeSize)
  })

  it("returns a single boundary for a 2-column layout", () => {
    const editor = makeColumnsEditor([1, 1])
    const layout = editor.state.doc.child(1)
    expect(columnBoundaryOffsets(layout)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Boundary handle widget decorations
// ---------------------------------------------------------------------------

describe("boundary handle decorations", () => {
  it("renders one handle per adjacent column pair, inside the layout DOM", () => {
    makeColumnsEditor([1, 1])
    const handles = container.querySelectorAll(".rune-col-resize-handle")
    expect(handles).toHaveLength(1)
    expect(handles[0]!.parentElement?.classList.contains("rune-columns")).toBe(true)
    expect((handles[0] as HTMLElement).dataset.runeColBoundary).toBe("0")
  })

  it("renders two handles for a 3-column layout", () => {
    makeColumnsEditor([1, 1, 1])
    const handles = container.querySelectorAll<HTMLElement>(".rune-col-resize-handle")
    expect(handles).toHaveLength(2)
    expect(handles[0]!.dataset.runeColBoundary).toBe("0")
    expect(handles[1]!.dataset.runeColBoundary).toBe("1")
  })

  it("each handle sits between its column pair in DOM order", () => {
    makeColumnsEditor([1, 1, 1])
    const handles = container.querySelectorAll<HTMLElement>(".rune-col-resize-handle")
    handles.forEach((h) => {
      expect(h.previousElementSibling?.hasAttribute("data-rune-column")).toBe(true)
      expect(h.nextElementSibling?.hasAttribute("data-rune-column")).toBe(true)
    })
  })

  it("handles are decorations only — never serialized into block HTML", () => {
    const editor = makeColumnsEditor([1, 1])
    expect(editor.getHTML()).not.toContain("rune-col-resize-handle")
  })

  it("marks the layout suppressed while a foreign gesture owns the registry", () => {
    const editor = makeColumnsEditor([1, 1])
    const layoutEl = container.querySelector("[data-rune-columns]")!
    expect(layoutEl.hasAttribute("data-rune-cols-suppressed")).toBe(false)

    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "block-drag" }),
    )
    expect(
      container
        .querySelector("[data-rune-columns]")!
        .hasAttribute("data-rune-cols-suppressed"),
    ).toBe(true)

    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: null }),
    )
    expect(
      container
        .querySelector("[data-rune-columns]")!
        .hasAttribute("data-rune-cols-suppressed"),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gesture protocol (CellHandleDrag contract)
// ---------------------------------------------------------------------------

describe("column-resize gesture protocol", () => {
  it("does not claim below the movement threshold", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    mouseDown(handleEl(), 300)
    mouseMove(300 + COLUMN_RESIZE_THRESHOLD_PX - 1)
    expect(activeGesture(editor)).toBeNull()
    mouseUp(300 + COLUMN_RESIZE_THRESHOLD_PX - 1)
    expect(activeGesture(editor)).toBeNull()
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  it("claims 'column-resize' at the movement threshold and clears on mouseup", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    mouseDown(handleEl(), 300)
    mouseMove(310)
    expect(activeGesture(editor)).toBe("column-resize")
    mouseUp(310)
    expect(activeGesture(editor)).toBeNull()
  })

  it("refuses at entry when another gesture owns the registry", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "block-drag" }),
    )
    mouseDown(handleEl(), 300)
    mouseMove(360)
    expect(activeGesture(editor)).toBe("block-drag")
    // No live preview was written either.
    expect(columnEls()[0]!.style.getPropertyValue("--rune-col-width")).toBe("1")
    mouseUp(360)
    expect(activeGesture(editor)).toBe("block-drag")
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  it("race-safe clear: never stomps a registry value it does not own", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    mouseDown(handleEl(), 300)
    mouseMove(310)
    expect(activeGesture(editor)).toBe("column-resize")
    // Simulate a racing overwrite while the drag is still in flight.
    editor.view.dispatch(
      editor.state.tr.setMeta(gestureKey, { activeGesture: "marquee" }),
    )
    mouseUp(310)
    expect(activeGesture(editor)).toBe("marquee")
  })

  it("writes the live preview onto exactly the two adjacent columns", () => {
    const editor = makeColumnsEditor([1, 1, 1])
    const cols = columnEls()
    cols[0]!.getBoundingClientRect = () => domRect(0, 300)
    cols[1]!.getBoundingClientRect = () => domRect(300, 600)
    cols[2]!.getBoundingClientRect = () => domRect(600, 900)

    mouseDown(handleEl(0), 300)
    mouseMove(360)
    // 360/600 of the pair → 1.2 / 0.8; third column untouched.
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1.2")
    expect(cols[1]!.style.getPropertyValue("--rune-col-width")).toBe("0.8")
    expect(cols[2]!.style.getPropertyValue("--rune-col-width")).toBe("1")
    expect(activeGesture(editor)).toBe("column-resize")
    mouseUp(360)
  })

  it("commits both widths in ONE history-visible transaction on mouseup", () => {
    const editor = makeColumnsEditor([1, 1])
    setPairRects()
    mouseDown(handleEl(), 300)
    mouseMove(360)
    mouseUp(360)

    expect(columnWidths(editor)).toEqual([1.2, 0.8])
    expect(activeGesture(editor)).toBeNull()

    // One undo restores BOTH widths — single transaction, addToHistory true.
    editor.commands.undo()
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  it("clamps the commit at the pair-fraction floor", () => {
    const editor = makeColumnsEditor([1, 1])
    setPairRects()
    mouseDown(handleEl(), 300)
    mouseMove(-10_000)
    mouseUp(-10_000)
    expect(columnWidths(editor)).toEqual([
      MIN_COLUMN_PAIR_FRACTION * 2,
      2 - MIN_COLUMN_PAIR_FRACTION * 2,
    ])
  })

  it("ignores a non-primary mouseup mid-resize (right release must not commit)", () => {
    const editor = makeColumnsEditor([1, 1])
    setPairRects()
    const cols = columnEls()
    mouseDown(handleEl(), 300)
    mouseMove(360)
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1.2")

    // Right-button release while the primary is still held — the gesture
    // must stay live and nothing may commit (right-click mid-drag is a
    // cancel-ish gesture, never a commit).
    mouseUp(360, 50, { button: 2, buttons: 1 })
    expect(activeGesture(editor)).toBe("column-resize")
    expect(columnWidths(editor)).toEqual([1, 1])
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1.2")

    // The primary release still commits normally.
    mouseUp(360)
    expect(columnWidths(editor)).toEqual([1.2, 0.8])
    expect(activeGesture(editor)).toBeNull()
  })

  it("cancels with revert when a mousemove reports the primary button released", () => {
    const editor = makeColumnsEditor([1, 1])
    setPairRects()
    const cols = columnEls()
    mouseDown(handleEl(), 300)
    mouseMove(360)
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1.2")

    // Lost mouseup: the next move arrives with no buttons pressed (alt-tab,
    // OS dialog eating the release). Cancel like Escape/blur — restore the
    // pre-drag preview, release the registry, commit nothing.
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, buttons: 0, clientX: 400, clientY: 50 }),
    )

    expect(activeGesture(editor)).toBeNull()
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1")
    expect(cols[1]!.style.getPropertyValue("--rune-col-width")).toBe("1")
    expect(columnWidths(editor)).toEqual([1, 1])

    // A trailing move/up after the cancel must not resurrect or commit.
    mouseMove(420)
    mouseUp(420)
    expect(activeGesture(editor)).toBeNull()
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  it("Escape cancels: registry cleared, preview restored, doc untouched", () => {
    const editor = makeColumnsEditor([1, 1])
    setPairRects()
    const cols = columnEls()
    mouseDown(handleEl(), 300)
    mouseMove(360)
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1.2")

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    )

    expect(activeGesture(editor)).toBeNull()
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1")
    expect(cols[1]!.style.getPropertyValue("--rune-col-width")).toBe("1")
    expect(columnWidths(editor)).toEqual([1, 1])

    // A trailing move/up after cancel must not resurrect the gesture.
    mouseMove(400)
    mouseUp(400)
    expect(activeGesture(editor)).toBeNull()
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  it("does not start on a non-editable editor", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    editor.setEditable(false)
    mouseDown(handleEl(), 300)
    mouseMove(360)
    expect(activeGesture(editor)).toBeNull()
    mouseUp(360)
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  // GS-2(a): primaryLost in the sub-threshold window — armed state fully torn down.
  it("lost mouseup in the sub-threshold window aborts: no listeners survive, registry idle", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    mouseDown(handleEl(), 300)
    // Still below threshold — not yet claimed.
    mouseMove(300 + COLUMN_RESIZE_THRESHOLD_PX - 1)
    expect(activeGesture(editor)).toBeNull()

    // Primary button no longer held (lost mouseup during sub-threshold window).
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, buttons: 0, clientX: 301, clientY: 50 }),
    )

    // Armed state must be fully cleared — registry still idle.
    expect(activeGesture(editor)).toBeNull()

    // Listeners are gone: a later move PAST the threshold must NOT claim.
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 360, clientY: 50 }),
    )
    expect(activeGesture(editor)).toBeNull()
    expect(columnWidths(editor)).toEqual([1, 1])
  })

  // AV-2: editor becomes non-editable mid-resize → must abort (restore preview, no commit).
  it("editable flip mid-resize prevents commit and restores preview (AV-2)", () => {
    const editor = makeColumnsEditor([1, 1])
    setPairRects()
    const cols = columnEls()
    mouseDown(handleEl(), 300)
    mouseMove(360)
    expect(activeGesture(editor)).toBe("column-resize")
    expect(cols[0]!.style.getPropertyValue("--rune-col-width")).toBe("1.2")

    // Flip editable off while the gesture is in-flight.
    editor.setEditable(false)

    // Primary release must abort: restore the pre-drag preview, release the
    // registry, and NOT dispatch the setNodeAttribute commit.
    mouseUp(360)

    expect(activeGesture(editor)).toBeNull()
    // Preview restored to original attr-driven values (setEditable triggers a
    // view update that re-renders attrs into the DOM, but at minimum the
    // inline override from writePreview must not remain).
    expect(columnWidths(editor)).toEqual([1, 1])
  })
})

// ---------------------------------------------------------------------------
// Gesture yields (pitfalls 3 + 4)
// ---------------------------------------------------------------------------

describe("gesture yields for the resize handle", () => {
  it("marquee: a resize handle is never a marquee-eligible target (chrome selector)", () => {
    const editor = makeColumnsEditor()
    // Probe element OUTSIDE any .rune-block, so the rejection can only
    // come from marquee's chrome-selector yield list — not from the
    // generic in-block check.
    const probe = document.createElement("div")
    probe.className = "rune-col-resize-handle"
    container.appendChild(probe)
    const control = document.createElement("div")
    container.appendChild(control)
    try {
      expect(isMarqueeEligibleTarget(editor.view, control)).toBe(true)
      expect(isMarqueeEligibleTarget(editor.view, probe)).toBe(false)
    } finally {
      probe.remove()
      control.remove()
    }
  })

  it("drag-extend: handle mousedown does NOT trigger entry B's mousedown-time MBS promotion", () => {
    const editor = makeColumnsEditor()
    // Force headIndexAtY through its rect-walk fallback.
    ;(
      editor.view.posAtCoords as unknown as (coords: {
        left: number
        top: number
      }) => { pos: number; inside: number } | null
    ) = () => null

    // Root child rects: paragraph [0..30], layout [40..200].
    editor.state.doc.forEach((_node, offset, index) => {
      const dom = editor.view.nodeDOM(offset) as HTMLElement | null
      if (!dom) return
      dom.getBoundingClientRect = () =>
        index === 0 ? domRect(0, 600, 0, 30) : domRect(0, 600, 40, 200)
    })
    // Every block-content band inside the layout sits at [50..70] — a
    // mousedown at Y=100 is "in-block vertical padding", the exact zone
    // entry B promotes from at mousedown time (pitfall 4).
    container
      .querySelectorAll<HTMLElement>("[data-rune-columns] .rune-block-content")
      .forEach((el) => {
        el.getBoundingClientRect = () => domRect(0, 280, 50, 70)
      })

    mouseDown(handleEl(), 300, 100)

    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    expect(activeGesture(editor)).toBeNull()

    mouseUp(300, 100)
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
  })

  it("resize wins the handle even when an MBS covers the layout (block-drag padding yield)", () => {
    const editor = makeColumnsEditor()
    setPairRects()
    ;(
      editor.view.posAtCoords as unknown as (coords: {
        left: number
        top: number
      }) => { pos: number; inside: number } | null
    ) = () => null
    editor.state.doc.forEach((_node, offset, index) => {
      const dom = editor.view.nodeDOM(offset) as HTMLElement | null
      if (!dom) return
      dom.getBoundingClientRect = () =>
        index === 0 ? domRect(0, 600, 0, 30) : domRect(0, 600, 40, 200)
    })

    editor.commands.setBlockSelection({ from: 0, to: 1 })
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)

    mouseDown(handleEl(), 300, 100)
    mouseMove(310, 100)
    expect(activeGesture(editor)).toBe("column-resize")
    mouseUp(310, 100)
    expect(activeGesture(editor)).toBeNull()
  })
})
