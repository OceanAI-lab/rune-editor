// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import {
  edgeZoneAt,
  hitBlockIndexAtY,
  inVerticalArmBand,
  layoutBoundaryZoneAt,
  resolveLayoutZone,
  resolveWrapZone,
} from "./edge-zone"

// Task 7 (F6) — pure zone math, unit-tested (jsdom can't drive real-mouse
// coordinate walks; the e2e spec covers the gesture wiring).
//
// Locked semantics (Notion observation log 2026-06-10): the zone starts at the
// target block's CONTENT edge and extends OUTWARD `zonePx` (mouse-X keyed) — a
// pointer still over the text body returns null (plain vertical reorder).

const RECT = { left: 100, right: 500 }
const ZONE = 40

describe("edgeZoneAt", () => {
  it("pointer over the text body → null (plain vertical reorder)", () => {
    expect(edgeZoneAt(RECT, 300, ZONE)).toBeNull()
    expect(edgeZoneAt(RECT, 101, ZONE)).toBeNull()
    expect(edgeZoneAt(RECT, 499, ZONE)).toBeNull()
  })

  it("pointer AT the content edge is still over the body → null", () => {
    expect(edgeZoneAt(RECT, 100, ZONE)).toBeNull()
    expect(edgeZoneAt(RECT, 500, ZONE)).toBeNull()
  })

  it("pointer just past the right content edge arms the right zone", () => {
    expect(edgeZoneAt(RECT, 501, ZONE)).toBe("right")
    expect(edgeZoneAt(RECT, 530, ZONE)).toBe("right")
    expect(edgeZoneAt(RECT, 540, ZONE)).toBe("right") // outer boundary inclusive
  })

  it("pointer just past the left content edge arms the left zone", () => {
    expect(edgeZoneAt(RECT, 99, ZONE)).toBe("left")
    expect(edgeZoneAt(RECT, 70, ZONE)).toBe("left")
    expect(edgeZoneAt(RECT, 60, ZONE)).toBe("left") // outer boundary inclusive
  })

  it("degenerate (zero-width) rect never arms — jsdom-style all-zero rects stay inert", () => {
    // Unit suites drive the drag gesture under jsdom, where every
    // getBoundingClientRect() is 0×0 at (0,0); a cursor at x>0 would otherwise
    // read as "past the right content edge" and falsely arm the zone.
    expect(edgeZoneAt({ left: 0, right: 0 }, 10, ZONE)).toBeNull()
    expect(edgeZoneAt({ left: 0, right: 0 }, -10, ZONE)).toBeNull()
    expect(edgeZoneAt({ left: 100, right: 100 }, 110, ZONE)).toBeNull()
  })

  it("pointer beyond the zone width → null", () => {
    expect(edgeZoneAt(RECT, 541, ZONE)).toBeNull()
    expect(edgeZoneAt(RECT, 59, ZONE)).toBeNull()
    expect(edgeZoneAt(RECT, 0, ZONE)).toBeNull()
    expect(edgeZoneAt(RECT, 1000, ZONE)).toBeNull()
  })
})

describe("layoutBoundaryZoneAt", () => {
  // 2-column layout: columns at [100..280] and [320..500]; gutter (320-280=40)
  // between them. Outer edges follow the same content-edge-outward rule.
  const COLS = [
    { left: 100, right: 280 },
    { left: 320, right: 500 },
  ]

  it("outer LEFT edge zone → boundary index 0, bar at the first column's left", () => {
    expect(layoutBoundaryZoneAt(COLS, 90, ZONE)).toEqual({ index: 0, x: 100 })
    expect(layoutBoundaryZoneAt(COLS, 60, ZONE)).toEqual({ index: 0, x: 100 })
  })

  it("outer RIGHT edge zone → boundary index = columnCount, bar at the last column's right", () => {
    expect(layoutBoundaryZoneAt(COLS, 510, ZONE)).toEqual({ index: 2, x: 500 })
    expect(layoutBoundaryZoneAt(COLS, 540, ZONE)).toEqual({ index: 2, x: 500 })
  })

  it("inter-column gutter → boundary between the two columns, bar at the gutter midpoint", () => {
    expect(layoutBoundaryZoneAt(COLS, 300, ZONE)).toEqual({ index: 1, x: 300 })
    expect(layoutBoundaryZoneAt(COLS, 285, ZONE)).toEqual({ index: 1, x: 300 })
    expect(layoutBoundaryZoneAt(COLS, 315, ZONE)).toEqual({ index: 1, x: 300 })
  })

  it("pointer INSIDE a column body → null", () => {
    expect(layoutBoundaryZoneAt(COLS, 200, ZONE)).toBeNull()
    expect(layoutBoundaryZoneAt(COLS, 400, ZONE)).toBeNull()
    // Column edges themselves are inside the column rects.
    expect(layoutBoundaryZoneAt(COLS, 100, ZONE)).toBeNull()
    expect(layoutBoundaryZoneAt(COLS, 280, ZONE)).toBeNull()
    expect(layoutBoundaryZoneAt(COLS, 320, ZONE)).toBeNull()
    expect(layoutBoundaryZoneAt(COLS, 500, ZONE)).toBeNull()
  })

  it("pointer beyond the outer zones → null", () => {
    expect(layoutBoundaryZoneAt(COLS, 59, ZONE)).toBeNull()
    expect(layoutBoundaryZoneAt(COLS, 541, ZONE)).toBeNull()
  })

  it("3 columns: each gutter resolves to its own boundary index", () => {
    const three = [
      { left: 100, right: 200 },
      { left: 220, right: 320 },
      { left: 340, right: 440 },
    ]
    expect(layoutBoundaryZoneAt(three, 210, ZONE)).toEqual({ index: 1, x: 210 })
    expect(layoutBoundaryZoneAt(three, 330, ZONE)).toEqual({ index: 2, x: 330 })
    expect(layoutBoundaryZoneAt(three, 450, ZONE)).toEqual({ index: 3, x: 440 })
  })

  it("no columns → null", () => {
    expect(layoutBoundaryZoneAt([], 100, ZONE)).toBeNull()
  })

  it("degenerate (zero-width) column rects never arm", () => {
    const degenerate = [
      { left: 0, right: 0 },
      { left: 0, right: 0 },
    ]
    expect(layoutBoundaryZoneAt(degenerate, 10, ZONE)).toBeNull()
    expect(layoutBoundaryZoneAt(degenerate, -10, ZONE)).toBeNull()
  })
})

describe("resolveWrapZone — guards", () => {
  const base = {
    cursorX: 510,
    zonePx: ZONE,
    contentRect: RECT,
    isSource: false,
    draggedContainsLayout: false,
  }

  it("arms on the edge when no guard trips", () => {
    expect(resolveWrapZone(base)).toBe("right")
    expect(resolveWrapZone({ ...base, cursorX: 80 })).toBe("left")
  })

  it("never arms when the dragged source IS the target block (self-wrap no-op)", () => {
    expect(resolveWrapZone({ ...base, isSource: true })).toBeNull()
  })

  it("never arms when the dragged content contains a columnLayout (no nesting)", () => {
    expect(resolveWrapZone({ ...base, draggedContainsLayout: true })).toBeNull()
  })

  it("pointer over the body → null regardless of guards", () => {
    expect(resolveWrapZone({ ...base, cursorX: 300 })).toBeNull()
  })
})

describe("resolveLayoutZone — guards", () => {
  const COLS = [
    { left: 100, right: 280 },
    { left: 320, right: 500 },
  ]
  const base = {
    cursorX: 300,
    zonePx: ZONE,
    columnRects: COLS,
    isSource: false,
    draggedContainsLayout: false,
  }

  it("arms in the gutter when no guard trips", () => {
    expect(resolveLayoutZone(base)).toEqual({ index: 1, x: 300 })
  })

  it("never arms when the dragged source IS the layout itself", () => {
    expect(resolveLayoutZone({ ...base, isSource: true })).toBeNull()
  })

  it("never arms when the dragged content contains a columnLayout", () => {
    expect(resolveLayoutZone({ ...base, draggedContainsLayout: true })).toBeNull()
  })

  it("at 5 columns the zone simply does not arm (no dead drop)", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      left: 100 + i * 100,
      right: 180 + i * 100,
    }))
    expect(
      resolveLayoutZone({ ...base, columnRects: five, cursorX: 190 }),
    ).toBeNull()
    // 4 columns still arms.
    const four = five.slice(0, 4)
    expect(
      resolveLayoutZone({ ...base, columnRects: four, cursorX: 190 }),
    ).toEqual({ index: 1, x: 190 })
  })
})

describe("inVerticalArmBand", () => {
  // The zone arms only in the row's MIDDLE HALF (quarter-height margins,
  // strict). The locked F6 semantics constrain the X axis only; the row's
  // top/bottom quarters stay reorder territory — a vertical drag travelling
  // the grip column crosses row edges constantly and releasing near a slot
  // boundary must stay a reorder, never a surprise wrap (the frozen
  // BlockDrag padding-drag suite pins exactly that).
  const TOP = 100
  const BOTTOM = 140 // h = 40 → band (110, 130)

  it("arms in the middle half of the row", () => {
    expect(inVerticalArmBand(TOP, BOTTOM, 120)).toBe(true)
    expect(inVerticalArmBand(TOP, BOTTOM, 111)).toBe(true)
    expect(inVerticalArmBand(TOP, BOTTOM, 129)).toBe(true)
  })

  it("does not arm in the top/bottom quarters (slot-boundary territory)", () => {
    expect(inVerticalArmBand(TOP, BOTTOM, 105)).toBe(false)
    expect(inVerticalArmBand(TOP, BOTTOM, 135)).toBe(false)
    expect(inVerticalArmBand(TOP, BOTTOM, 100)).toBe(false)
    expect(inVerticalArmBand(TOP, BOTTOM, 140)).toBe(false)
  })

  it("band edges are strict (exactly at a quarter boundary stays reorder)", () => {
    expect(inVerticalArmBand(TOP, BOTTOM, 110)).toBe(false)
    expect(inVerticalArmBand(TOP, BOTTOM, 130)).toBe(false)
  })

  it("short paragraph keeps at least its middle HALF armable (quarter margins)", () => {
    // h = 32 → margin min(8, 24) = 8 → band (8, 24): exactly the middle half.
    expect(inVerticalArmBand(0, 32, 9)).toBe(true)
    expect(inVerticalArmBand(0, 32, 16)).toBe(true)
    expect(inVerticalArmBand(0, 32, 23)).toBe(true)
    expect(inVerticalArmBand(0, 32, 8)).toBe(false)
    expect(inVerticalArmBand(0, 32, 24)).toBe(false)
  })

  it("tall layout clamps the margin to 24px — at least height-48 armable", () => {
    // h = 600 → unclamped quarter would be 150 (a dead third of the layout);
    // the margin clamps to 24 → band (24, 576).
    expect(inVerticalArmBand(0, 600, 30)).toBe(true)
    expect(inVerticalArmBand(0, 600, 300)).toBe(true)
    expect(inVerticalArmBand(0, 600, 570)).toBe(true)
    expect(inVerticalArmBand(0, 600, 24)).toBe(false)
    expect(inVerticalArmBand(0, 600, 576)).toBe(false)
  })
})

describe("hitBlockIndexAtY", () => {
  const blocks = [
    { top: 0, bottom: 40 },
    { top: 48, bottom: 90 },
    { top: 100, bottom: 200 },
  ]

  it("returns the index of the block whose vertical band contains y", () => {
    expect(hitBlockIndexAtY(blocks, 20)).toBe(0)
    expect(hitBlockIndexAtY(blocks, 60)).toBe(1)
    expect(hitBlockIndexAtY(blocks, 150)).toBe(2)
  })

  it("band edges are inclusive", () => {
    expect(hitBlockIndexAtY(blocks, 0)).toBe(0)
    expect(hitBlockIndexAtY(blocks, 40)).toBe(0)
    expect(hitBlockIndexAtY(blocks, 200)).toBe(2)
  })

  it("returns -1 between blocks and outside the list", () => {
    expect(hitBlockIndexAtY(blocks, 44)).toBe(-1)
    expect(hitBlockIndexAtY(blocks, 95)).toBe(-1)
    expect(hitBlockIndexAtY(blocks, -5)).toBe(-1)
    expect(hitBlockIndexAtY(blocks, 300)).toBe(-1)
    expect(hitBlockIndexAtY([], 10)).toBe(-1)
  })
})
