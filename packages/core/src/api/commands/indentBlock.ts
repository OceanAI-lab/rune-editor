// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { getBlockSpecs, surfaceChildrenAt } from "../../schema"
import { DEFAULT_INDENT, type IndentConfig } from "../../schema/blocks/createSpec"
import { collectBlockTargets, type BlockTarget } from "./collectBlockTargets"
import { normalizeDepthAt } from "../depth"

function resolveIndentConfig(editor: Editor, typeName: string): IndentConfig {
  return getBlockSpecs(editor)[typeName]?.indent ?? DEFAULT_INDENT
}

function hasIndentablePredecessor(
  doc: ProseMirrorNode,
  targetPos: number,
  targetNode: ProseMirrorNode,
): boolean {
  const targetDepth = targetNode.attrs.depth as number
  // Surface-local: the structural same-kind-predecessor scan runs within the
  // block's own surface (column-local for a column child), never the root.
  const surface = surfaceChildrenAt(doc, targetPos)
  if (!surface) return false
  const lastPos: { node: ProseMirrorNode | null } = { node: null }
  let offset = surface.start
  surface.node.forEach((child) => {
    const childStart = offset
    offset += child.nodeSize
    if (childStart >= targetPos) return
    const childDepth = (child.attrs.depth as number | undefined) ?? 0
    if (childDepth > targetDepth) return
    lastPos.node = child
  })
  const predecessor = lastPos.node
  if (!predecessor) return false
  const predDepth = (predecessor.attrs.depth as number | undefined) ?? 0
  return predecessor.type.name === targetNode.type.name && predDepth === targetDepth
}

function planIndent(
  editor: Editor,
  doc: ProseMirrorNode,
  block: BlockTarget,
): { changed: boolean; newDepth: number } {
  const config = resolveIndentConfig(editor, block.node.type.name)
  const currentDepth = (block.node.attrs.depth as number | undefined) ?? 0
  // numeric (cap at maxDepth) and follow-prev (cap at immediately-preceding
  // sibling's depth + 1) share the same shape: request one deeper, clamp to
  // the legal max for this block at its position, succeed only if it grew.
  // The follow-prev +1 accounts for rune's CSS marker offset (a list marker
  // at depth=N puts its text content at column (N+1)*step), and the clamp
  // returns currentDepth when there's no preceding block (lone block can't
  // indent). Both rules live in `normalizeDepthAt`.
  if (config.mode === "numeric" || config.mode === "follow-prev") {
    const newDepth = normalizeDepthAt(doc, block.pos, currentDepth + 1, config)
    return { changed: newDepth > currentDepth, newDepth: Math.max(newDepth, currentDepth) }
  }
  if (!hasIndentablePredecessor(doc, block.pos, block.node)) {
    return { changed: false, newDepth: currentDepth }
  }
  return { changed: true, newDepth: currentDepth + 1 }
}

export function indentBlockImpl(
  id: string | undefined,
): (args: { editor: Editor; state: EditorState; dispatch: ((tr: any) => void) | undefined }) => boolean {
  return ({ editor, state, dispatch }) => {
    const targets = collectBlockTargets(editor, state.selection, id)
    if (targets.length === 0) return false
    // All plans read the same pre-transaction doc, so MBS caps are not
    // affected by earlier targets in this same command pass.
    const plans = targets.map((t) => ({ target: t, plan: planIndent(editor, state.doc, t) }))
    const anyChanged = plans.some((p) => p.plan.changed)
    if (!anyChanged) return false
    if (!dispatch) return true
    const tr = state.tr
    for (const { target, plan } of plans) {
      if (!plan.changed) continue
      tr.setNodeAttribute(target.pos, "depth", plan.newDepth)
    }
    dispatch(tr)
    return true
  }
}
