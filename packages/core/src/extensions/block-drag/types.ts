// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export interface BlockDragState {
  draggingRange: { from: number; to: number } | null
}

export interface BlockGeom {
  pos: number
  nodeSize: number
  type: string
  depth: number
  top: number
  bottom: number
  left: number
  indicatorLeft: number
  width: number
  marginTop: number
  marginBottom: number
}

export interface BlocksSnapshot {
  blocks: BlockGeom[]
  minLeft: number
  maxRight: number
  indentStepPx: number
}

export interface DropTarget {
  /** PM position to insert at (executor handles post-delete offset). */
  insertPos: number
  /**
   * Depth attribute the first depth-bearing block in the inserted slice should
   * end up at. Executor computes the delta from that first depth-bearing block
   * and shifts the `depth` attr of every block in the slice by that delta,
   * clamped to >= 0. Blocks without a `depth` attr are skipped. Applied for
   * both `text` and `mbs` selection modes. Absent = no depth changes.
   */
  newDepthAttr?: number
  indicatorLeft: number
  edgeY: number
}
