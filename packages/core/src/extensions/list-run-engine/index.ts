// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model"

export type ListKind = "numbered" | "bullet"

export type NumberedMarkerStyle = "decimal" | "lower-alpha" | "lower-roman"
export type BulletMarkerStyle = "disc" | "circle" | "square"
export type ListMarkerStyle = NumberedMarkerStyle | BulletMarkerStyle

export interface ListRunBlockInfo {
  /** Top-level offset of this block in the doc. */
  pos: number
  /** PM node size — used by callers building node decorations. */
  nodeSize: number
  kind: ListKind
  depth: number
  /**
   * True iff this block is the leader of its (kind, depth) run — the
   * first list-of-its-kind at this depth since the last break (different
   * kind at same depth, non-list block at >= depth, or doc start).
   *
   * Numbered-only in v1. Undefined for bullet (no consumer yet; populated
   * when bullet gains a run-level persisted attr — see spec §8).
   */
  isRunLeader?: boolean
  /** 1-based index inside the run. Numbered only. */
  index?: number
  markerStyle: ListMarkerStyle
}

export interface ListRunInfo {
  /** Keyed by top-level doc offset of each list block. */
  byPos: Map<number, ListRunBlockInfo>
}

const BULLET_MARKERS: readonly BulletMarkerStyle[] = ["disc", "circle", "square"]
const ORDERED_MARKERS: readonly NumberedMarkerStyle[] = ["decimal", "lower-alpha", "lower-roman"]

interface StackEntry { kind: "ordered" | "bullet"; flatDepth: number }

function countKind(stack: StackEntry[], kind: StackEntry["kind"]): number {
  let n = 0
  for (const e of stack) if (e.kind === kind) n += 1
  return n
}

/**
 * Pure single-pass walk over the doc that produces every piece of
 * per-list-block presentational state in one place. Consumers:
 *
 *   - ListNumbering decoration: reads `index` + `markerStyle` to render.
 *   - ListNormalization appendTransaction: reads `isRunLeader` to decide
 *     which `start` attrs are stale and must be cleared.
 *
 * Both consumers MUST go through this function — duplicating the run
 * walk in either consumer would let "what is a run leader" drift
 * between rendering and normalization, which is exactly the class of
 * bug this layer exists to prevent.
 */
export function computeListRuns(doc: ProseMirrorNode): ListRunInfo {
  const stack: StackEntry[] = []
  const depthCounters = new Map<number, number>()
  const byPos = new Map<number, ListRunBlockInfo>()

  doc.forEach((block, offset) => {
    const depth = typeof block.attrs.depth === "number" ? block.attrs.depth : 0

    while (stack.length > 0 && (stack[stack.length - 1]?.flatDepth ?? 0) >= depth) {
      stack.pop()
    }

    if (block.type.name === "numberedList") {
      for (const key of Array.from(depthCounters.keys())) {
        if (key > depth) depthCounters.delete(key)
      }

      const markerStyle = ORDERED_MARKERS[countKind(stack, "ordered") % 3]!
      const previous = depthCounters.get(depth)
      const isRunLeader = previous == null
      const rawStart = typeof block.attrs.start === "number" ? block.attrs.start : null
      // Leader honors `start` (`start=1` is equivalent to null since 1 is
      // the default index); non-leaders ignore `start` entirely — the
      // counter wins. ListNormalization erases stale non-leader `start`
      // attrs from the doc so the stored shape matches what is rendered.
      const index = isRunLeader
        ? (rawStart ?? 1)
        : (previous as number) + 1
      depthCounters.set(depth, index)

      byPos.set(offset, {
        pos: offset,
        nodeSize: block.nodeSize,
        kind: "numbered",
        depth,
        isRunLeader,
        index,
        markerStyle,
      })
      stack.push({ kind: "ordered", flatDepth: depth })
    } else if (block.type.name === "bulletList") {
      for (const key of Array.from(depthCounters.keys())) {
        if (key >= depth) depthCounters.delete(key)
      }

      const markerStyle = BULLET_MARKERS[countKind(stack, "bullet") % 3]!
      byPos.set(offset, {
        pos: offset,
        nodeSize: block.nodeSize,
        kind: "bullet",
        depth,
        markerStyle,
      })
      stack.push({ kind: "bullet", flatDepth: depth })
    } else {
      for (const key of Array.from(depthCounters.keys())) {
        if (key >= depth) depthCounters.delete(key)
      }
    }
  })

  return { byPos }
}
