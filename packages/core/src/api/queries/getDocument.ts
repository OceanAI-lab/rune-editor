// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { RuneBlock } from "../../blocks"
import type { RuneBlockProjectionContext } from "../../schema/blocks/types"
import { getBlockSpecs } from "../../schema/blocks/registry"

export function blockFromNode(editor: Editor, node: ProseMirrorNode): RuneBlock | null {
  const project = getBlockSpecs(editor)[node.type.name]?.toRuneBlock
  if (typeof project !== "function") return null

  // Projection context: a container block recurses into its children via
  // `ctx.projectChild`, which is `blockFromNode` itself — so a child
  // projects identically whether reached top-level or via a parent. The
  // registry is threaded through the captured `editor`. There is no
  // infinite-loop risk for the flat case: today no body block's content
  // holds other body blocks, so projectChild is simply never called.
  const ctx: RuneBlockProjectionContext = {
    projectChild: (child) => blockFromNode(editor, child),
  }

  const result = project(node, ctx)
  return (result ?? null) as RuneBlock | null
}

export function getDocument(editor: Editor): RuneBlock[] {
  const blocks: RuneBlock[] = []
  editor.state.doc.forEach((node) => {
    const block = blockFromNode(editor, node)
    if (block) blocks.push(block)
  })
  return blocks
}

/**
 * Any container block that nests other RuneBlocks. The only built-in today
 * is `columnLayout` (`columns[].children`). A future container declares its
 * nested arrays here so the single recursive walker (`walkRuneBlocks`)
 * reaches them — keeping recursion in ONE place, not copied per query.
 */
function nestedChildrenOf(block: RuneBlock): RuneBlock[] {
  if (block.type === "columnLayout") {
    const out: RuneBlock[] = []
    for (const column of (block as { columns: Array<{ children: RuneBlock[] }> }).columns) {
      out.push(...column.children)
    }
    return out
  }
  return []
}

/**
 * Depth-first visit of every projected RuneBlock — top-level blocks AND the
 * blocks nested inside container blocks (column children). The shared walker
 * behind `getBlockById` / `findBlocks` so neither re-implements recursion.
 * Visits a container before its children (document order).
 */
export function walkRuneBlocks(
  blocks: RuneBlock[],
  fn: (block: RuneBlock) => void,
): void {
  for (const block of blocks) {
    fn(block)
    const children = nestedChildrenOf(block)
    if (children.length > 0) walkRuneBlocks(children, fn)
  }
}
