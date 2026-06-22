// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Drag-to-create columns (F6) — pure edge-zone math.
//
// Locked semantics (Notion observation log, 2026-06-10):
//   - The zone starts at the target block's CONTENT edge and extends OUTWARD
//     `zonePx` (≈40px, the `--rune-col-dropzone` token). It is keyed on the
//     MOUSE X, not the drag ghost. A pointer still over the text body resolves
//     to null — that is a plain vertical reorder.
//   - On an existing layout the zones are its outer content edges plus every
//     inter-column gutter (the resize-handle strip); at the schema cap of 5
//     columns the zone simply does not arm (no dead drop).
//
// All functions here are pure (rects + numbers in, zone out) so jsdom unit
// tests cover the math; the real-mouse wiring lives in gesture.ts and is
// covered by the Playwright spec (columns-create-by-drag.spec.ts).

import { MAX_COLUMNS } from "../../blocks/Columns/block"

export type EdgeZoneSide = "left" | "right"

export interface HorizontalRect {
  left: number
  right: number
}

/**
 * Edge zone of a single (non-layout) root block. `null` while the pointer is
 * over the content box (inclusive of both edges); `"left"` / `"right"` within
 * `zonePx` OUTWARD of the corresponding content edge.
 */
export function edgeZoneAt(
  blockRect: HorizontalRect,
  cursorX: number,
  zonePx: number,
): EdgeZoneSide | null {
  // Degenerate rect — a detached / unlaid-out element (jsdom rects are all
  // 0×0). There is no content edge to key on; never arm.
  if (blockRect.right <= blockRect.left) return null
  if (cursorX < blockRect.left && cursorX >= blockRect.left - zonePx) {
    return "left"
  }
  if (cursorX > blockRect.right && cursorX <= blockRect.right + zonePx) {
    return "right"
  }
  return null
}

export interface LayoutBoundaryZone {
  /** Column boundary index `0..columnCount` the new column inserts at. */
  index: number
  /** Viewport X the vertical indicator bar renders at. */
  x: number
}

/**
 * Boundary zone of an existing layout, from its column content rects (in
 * column order): the outer edges follow the same content-edge-outward rule as
 * `edgeZoneAt` (bar at the outermost column edge), and every inter-column
 * gutter — the full strip between two adjacent column rects — resolves to the
 * boundary between them (bar at the gutter midpoint). Pointer inside any
 * column rect → null (cross-surface drop handles it).
 */
export function layoutBoundaryZoneAt(
  columnRects: readonly HorizontalRect[],
  cursorX: number,
  zonePx: number,
): LayoutBoundaryZone | null {
  if (columnRects.length === 0) return null
  // Degenerate rects (see edgeZoneAt) — no real geometry, never arm.
  if (columnRects.some((rect) => rect.right <= rect.left)) return null
  const first = columnRects[0]!
  const last = columnRects[columnRects.length - 1]!
  if (cursorX < first.left && cursorX >= first.left - zonePx) {
    return { index: 0, x: first.left }
  }
  if (cursorX > last.right && cursorX <= last.right + zonePx) {
    return { index: columnRects.length, x: last.right }
  }
  for (let i = 0; i < columnRects.length - 1; i++) {
    const gapStart = columnRects[i]!.right
    const gapEnd = columnRects[i + 1]!.left
    if (cursorX > gapStart && cursorX < gapEnd) {
      return { index: i + 1, x: (gapStart + gapEnd) / 2 }
    }
  }
  return null
}

export interface WrapZoneParams {
  cursorX: number
  zonePx: number
  /** Content-box rect of the hovered root block. */
  contentRect: HorizontalRect
  /** The hovered block is part of the dragged run (self-wrap no-op). */
  isSource: boolean
  /** The dragged run contains a columnLayout (wrapping would nest — forbidden). */
  draggedContainsLayout: boolean
}

/** `edgeZoneAt` plus the F6 guards. */
export function resolveWrapZone(params: WrapZoneParams): EdgeZoneSide | null {
  if (params.isSource || params.draggedContainsLayout) return null
  return edgeZoneAt(params.contentRect, params.cursorX, params.zonePx)
}

export interface LayoutZoneParams {
  cursorX: number
  zonePx: number
  /** Column content rects of the hovered layout, in column order. */
  columnRects: readonly HorizontalRect[]
  /** The hovered layout is part of the dragged run. */
  isSource: boolean
  /** The dragged run contains a columnLayout (no nesting). */
  draggedContainsLayout: boolean
}

/** `layoutBoundaryZoneAt` plus the F6 guards, incl. the 5-column cap. */
export function resolveLayoutZone(
  params: LayoutZoneParams,
): LayoutBoundaryZone | null {
  if (params.isSource || params.draggedContainsLayout) return null
  if (params.columnRects.length >= MAX_COLUMNS) return null
  return layoutBoundaryZoneAt(params.columnRects, params.cursorX, params.zonePx)
}

/** Cap on the arm band's top/bottom margins (see `inVerticalArmBand`). */
const ARM_BAND_MAX_MARGIN_PX = 24

/**
 * Whether `clientY` sits in the row's vertical arm band — the band where an
 * edge zone may arm: strict quarter-height margins, each clamped to
 * `ARM_BAND_MAX_MARGIN_PX`.
 *
 * The locked F6 semantics constrain the X axis only ("content edge outward,
 * mouse-X keyed"); the Y axis is an engineering call defending a real failure
 * mode: the side-menu grip column sits ~25-30px left of the content edge —
 * INSIDE the 40px left zone — so a plain vertical reorder drag travels the
 * zone's X range the whole way down. Releasing near a row's top/bottom edge
 * (slot-boundary territory, where every reorder drop lands) must stay a
 * reorder; only a deliberate hover at a row's vertical middle arms the wrap /
 * add-column bar.
 *
 * The clamp keeps that defense proportionate: a normal text row (h ≲ 96px)
 * gets the plain quarter margins, while a tall target — a multi-block column
 * layout, a big image — arms nearly full-height instead of growing 100px+
 * dead zones (an unclamped 600px layout would refuse the top/bottom 150px).
 */
export function inVerticalArmBand(
  top: number,
  bottom: number,
  clientY: number,
): boolean {
  const margin = Math.min((bottom - top) / 4, ARM_BAND_MAX_MARGIN_PX)
  return clientY > top + margin && clientY < bottom - margin
}

/**
 * Index of the snapshot block whose vertical band contains `clientY`
 * (inclusive band edges), or `-1` when the pointer sits between blocks or
 * outside the list. Distinct from `slotAtY`, which resolves the INSERT slot —
 * the zone needs the block the pointer is actually OVER.
 */
export function hitBlockIndexAtY(
  blocks: ReadonlyArray<{ top: number; bottom: number }>,
  clientY: number,
): number {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if (clientY >= b.top && clientY <= b.bottom) return i
  }
  return -1
}
