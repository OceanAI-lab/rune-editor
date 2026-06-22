// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { getBlockSpecs, isStructuralIndentType, type BlockSpecMetadata } from "../../schema"
import type { RuneMarkdownSpacing } from "../../schema"
import { serializeInlineContent } from "./serializeInline"

const INDENT = "    "

function isListType(editor: Editor, type: string): boolean {
  return isStructuralIndentType(editor, type)
}

interface BlockInfo {
  type: string
  depth: number
  line: string
  spacing?: RuneMarkdownSpacing
}

function serializeBlock(
  specs: Record<string, BlockSpecMetadata>,
  editor: Editor,
  node: PMNode,
  numberedIndex: number | undefined,
  depthOffset: number = 0,
): BlockInfo | null {
  const type = node.type.name
  const rawDepth: number = typeof node.attrs.depth === "number" ? node.attrs.depth : 0
  const depth = Math.max(0, rawDepth - depthOffset)
  const prefix = depth > 0 ? INDENT.repeat(depth) : ""

  const toMarkdown = specs[type]?.toMarkdown
  if (!toMarkdown) return null

  const rendered = toMarkdown({
    editor,
    node,
    depth,
    prefix,
    numberedIndex,
    serializeInline: serializeInlineContent,
  })
  if (!rendered) return null
  return {
    type: rendered.type ?? type,
    depth: rendered.depth ?? depth,
    line: rendered.line,
    spacing: rendered.spacing,
  }
}

/**
 * Determine whether a blank line should be inserted between two consecutive
 * blocks. Consecutive list items (any list type) get no blank line.
 * List → deeper child list also gets no blank line.
 * Toggle followed by its children (deeper blocks) gets no blank line.
 */
function needsBlankLineBetween(
  editor: Editor,
  prev: BlockInfo,
  curr: BlockInfo,
): boolean {
  // Spacing hints from registry serializers
  if (prev.spacing === "isolated" || curr.spacing === "isolated") return true
  if (prev.spacing === "list-item" && curr.spacing === "list-item") return false

  const prevIsList = isListType(editor, prev.type)
  const currIsList = isListType(editor, curr.type)

  // Consecutive list items: no blank line
  if (prevIsList && currIsList) return false

  // List followed by toggle child at greater depth: no blank line
  if (prevIsList && curr.type === "toggle" && curr.depth > prev.depth) return false

  return true
}

/** The HTML-comment separator injected between adjacent ordered-list runs. */
const ORDERED_SEPARATOR: BlockInfo = Object.freeze({
  type: "__orderedSeparator__",
  depth: 0,
  line: "<!-- -->",
  spacing: "isolated" as const,
})

export function exportMarkdown(editor: Editor): string {
  const doc = editor.state.doc
  const specs = getBlockSpecs(editor)
  const results: BlockInfo[] = []

  // Serialize one flat block surface (the root doc, or one column's
  // children) into `results`. Numbered counters and toggle-heading context
  // are surface-local — they never leak across a column boundary.
  const serializeSurface = (nodes: readonly PMNode[]): void => {
    const numberedCounters = new Map<number, number>()

    // Track toggle heading context for depth flattening.
    // When a toggle with level > 0 is encountered at depth D, children at
    // depth > D are flattened (depth offset = D + 1) so they render without
    // extra indentation in Markdown.
    let toggleHeadingDepth: number | null = null

    // AV-1 trailing-edge: after a columnLayout serializes, this holds the
    // results index at which the very next block will land. If that next block
    // is also a numberedList we splice a separator there.  Carries an index
    // rather than a boolean so the splice position is unambiguous even when
    // a second layout follows immediately.  Cleared (set to null) at the top
    // of every iteration after it is resolved (whether a splice fires or not).
    let pendingTrailingBoundaryIdx: number | null = null

    for (const node of nodes) {
      const type = node.type.name

      if (type === "columnLayout") {
        // Markdown has no columns — FLATTEN the layout: each column's
        // children serialize in column order through this same pipeline,
        // each column as its own surface. A child's surface-local depth
        // projects as root-level indentation — mirroring the unwrap rule
        // (Columns/normalization.ts), which splices a survivor column's
        // children to root with depths preserved.
        //
        // AV-1 separator rule: CommonMark renderers merge adjacent ordered
        // lists into one renumbered sequence. We collect surface-boundary
        // indices into boundaryIdxs — one per inter-column gap plus the
        // leading-edge boundary — then walk them right-to-left and splice a
        // separator wherever results[idx-1] and results[idx] are both
        // numberedList. Right-to-left iteration keeps earlier indices valid
        // after each splice.  The trailing-edge boundary (after the last
        // column) is deferred to the next iteration via
        // pendingTrailingBoundaryIdx because the next block has not yet been
        // pushed and its type is unknown.

        // Resolve any deferred trailing-edge boundary from the preceding
        // layout before this layout's first column writes into results.
        if (pendingTrailingBoundaryIdx !== null) {
          const idx = pendingTrailingBoundaryIdx
          pendingTrailingBoundaryIdx = null
          // The leading-edge boundary of THIS layout will write at idx.
          // The "right neighbour" check fires once we know the first block
          // of this layout — handle below after columns serialize.
          // For now, just record idx so we can use it as the leading edge.
          // Actually: the leading-edge boundary IS this deferred idx when
          // layouts are adjacent.  We fold it into boundaryIdxs below.
          // (If both sides are numberedList the splice will fire in the
          // right-to-left pass.)

          // Leading-edge boundary index when layout immediately follows layout:
          const boundaryIdxs: number[] = [idx]
          node.forEach((column) => {
            const children: PMNode[] = []
            column.forEach((child) => children.push(child))
            serializeSurface(children)
            boundaryIdxs.push(results.length)
          })
          // Right-to-left pass for leading + inter-column boundaries.
          // Skip the last entry — that is the new trailing-edge boundary,
          // deferred to the next iteration.
          for (let i = boundaryIdxs.length - 2; i >= 0; i--) {
            const bidx = boundaryIdxs[i]!
            if (
              results[bidx - 1]?.type === "numberedList" &&
              results[bidx]?.type === "numberedList"
            ) {
              results.splice(bidx, 0, { ...ORDERED_SEPARATOR })
            }
          }
          pendingTrailingBoundaryIdx = results.length
          numberedCounters.clear()
          toggleHeadingDepth = null
          continue
        }

        // Normal (non-adjacent-layout) path:
        // Leading-edge boundary index = current results.length before any
        // column serializes.
        const boundaryIdxs: number[] = [results.length]

        node.forEach((column) => {
          const children: PMNode[] = []
          column.forEach((child) => children.push(child))
          serializeSurface(children)
          // Record the boundary after this column (= before the next column).
          boundaryIdxs.push(results.length)
        })

        // Right-to-left pass for leading + inter-column boundaries.
        // Skip the last entry — that is the trailing-edge boundary,
        // deferred to the next iteration.
        for (let i = boundaryIdxs.length - 2; i >= 0; i--) {
          const idx = boundaryIdxs[i]!
          if (
            results[idx - 1]?.type === "numberedList" &&
            results[idx]?.type === "numberedList"
          ) {
            results.splice(idx, 0, { ...ORDERED_SEPARATOR })
          }
        }

        // Defer the trailing-edge boundary.
        pendingTrailingBoundaryIdx = results.length

        // On ITS surface the layout acts like any other non-list block:
        // it breaks numbered runs and toggle-heading contexts.
        numberedCounters.clear()
        toggleHeadingDepth = null
        continue
      }

      // AV-1 trailing-edge: resolve any pending boundary from the previous
      // layout. If this (regular) block is a numberedList and the block just
      // before the boundary was also a numberedList, splice a separator.
      if (pendingTrailingBoundaryIdx !== null) {
        const idx = pendingTrailingBoundaryIdx
        pendingTrailingBoundaryIdx = null
        if (
          type === "numberedList" &&
          results[idx - 1]?.type === "numberedList"
        ) {
          results.splice(idx, 0, { ...ORDERED_SEPARATOR })
        }
      }

      const nodeDepth: number =
        typeof node.attrs.depth === "number" ? node.attrs.depth : 0

      // Exit toggle heading context when we reach a block at or above the
      // toggle heading's own depth (sibling or ancestor level)
      if (
        toggleHeadingDepth !== null &&
        (type !== "toggle" || (node.attrs.level ?? 0) === 0) &&
        nodeDepth <= toggleHeadingDepth
      ) {
        toggleHeadingDepth = null
      }

      // Enter toggle heading context
      if (type === "toggle" && (node.attrs.level ?? 0) > 0) {
        toggleHeadingDepth = nodeDepth
      }

      // Compute depth offset for children of toggle headings
      const depthOffset =
        toggleHeadingDepth !== null && nodeDepth > toggleHeadingDepth
          ? toggleHeadingDepth + 1
          : 0

      // Compute adjusted depth (same as serializeBlock will use for counter keys)
      const adjustedDepth = Math.max(0, nodeDepth - depthOffset)

      // Update numbered counters based on block type — managed centrally
      let numberedIndex: number | undefined

      if (type === "numberedList") {
        // Clear counters deeper than current depth
        for (const key of numberedCounters.keys()) {
          if (key > adjustedDepth) numberedCounters.delete(key)
        }
        // Init counter at this depth if absent
        if (!numberedCounters.has(adjustedDepth)) {
          const start = node.attrs.start
          numberedCounters.set(
            adjustedDepth,
            typeof start === "number" ? start : 1,
          )
        }
        numberedIndex = numberedCounters.get(adjustedDepth)!
        numberedCounters.set(adjustedDepth, numberedIndex + 1)
      } else if (isListType(editor, type) || type === "toggle") {
        // Non-numbered list types: clear counters at adjusted depth and deeper
        for (const key of numberedCounters.keys()) {
          if (key >= adjustedDepth) numberedCounters.delete(key)
        }
      } else {
        // Non-list, non-toggle: clear all counters
        numberedCounters.clear()
      }

      const info = serializeBlock(specs, editor, node, numberedIndex, depthOffset)
      if (info) results.push(info)
    }
  }

  const rootNodes: PMNode[] = []
  doc.content.forEach((node) => rootNodes.push(node))
  serializeSurface(rootNodes)

  if (results.length === 0) return "\n"

  const lines: string[] = []
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && needsBlankLineBetween(editor, results[i - 1]!, results[i]!)) {
      lines.push("")
    }
    lines.push(results[i]!.line)
  }

  return lines.join("\n") + "\n"
}
