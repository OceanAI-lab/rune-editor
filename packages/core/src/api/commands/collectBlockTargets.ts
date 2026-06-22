// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Selection } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { MultiBlockSelection } from "../../extensions/block-selection/MultiBlockSelection"
import {
  resolveBodyBlockById,
  bodyBlocksInRange,
  nearestBodyBlock,
} from "../../schema/bodySurface"

/** A block resolved as a command target. */
export interface BlockTarget {
  id: string
  pos: number
  node: ProseMirrorNode
}

/**
 * Resolve the body blocks a block-level command (indent/outdent) should act on,
 * given the current selection and an optional explicit block id. This is the
 * shared implementation that `indentBlock` and `outdentBlock` previously each
 * carried a verbatim copy of.
 *
 * Three branches, each backed by a Task-1 body-surface resolver so the walk is
 * centralized (and Phase 1's nested surfaces inherit it for free):
 * - `explicitId` → `resolveBodyBlockById` (single block by id).
 * - `MultiBlockSelection` → `bodyBlocksInRange` (the selection's boundary range).
 * - caret / other → `nearestBodyBlock` (the block the cursor sits in).
 *
 * Return shape is exactly `{ id, pos, node }[]`; downstream code depends on it.
 * Blocks without an `id` are skipped — they cannot be a command target.
 */
export function collectBlockTargets(
  editor: Editor,
  selection: Selection,
  explicitId: string | undefined,
): BlockTarget[] {
  const doc = selection.$from.doc
  if (explicitId !== undefined) {
    const resolved = resolveBodyBlockById(doc, explicitId)
    if (!resolved) return []
    return [{ id: resolved.id, pos: resolved.pos, node: resolved.node }]
  }
  if (selection instanceof MultiBlockSelection) {
    return bodyBlocksInRange(doc, selection.from, selection.to).map((b) => ({
      id: b.id,
      pos: b.pos,
      node: b.node,
    }))
  }
  const $from = selection.$from
  if ($from.depth < 1) return []
  const nearest = nearestBodyBlock(editor, $from)
  if (!nearest) return []
  const id = nearest.node.attrs.id as string | undefined
  if (!id) return []
  return [{ id, pos: nearest.pos, node: nearest.node }]
}
