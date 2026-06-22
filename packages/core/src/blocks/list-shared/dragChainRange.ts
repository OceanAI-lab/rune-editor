// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { structuralIndentTypes, surfaceChildrenAt } from "../../schema"

// Fallback list-type classification for callers that don't supply an
// editor (direct unit tests). The production drag path always passes
// `editor`, which derives the set from spec metadata (the single source
// of truth shared with indent / split / markdown export).
const FALLBACK_STRUCTURAL_TYPES = new Set([
  "bulletList",
  "numberedList",
  "taskList",
])

export function listChainDragRange(args: {
  node: ProseMirrorNode
  pos: number
  doc: ProseMirrorNode
  editor?: Editor
}): { from: number; to: number } {
  const { node, pos, doc, editor } = args
  const structuralTypes = editor
    ? structuralIndentTypes(editor)
    : FALLBACK_STRUCTURAL_TYPES
  const selfDepth = typeof node.attrs.depth === "number" ? node.attrs.depth : 0

  // Walk the surface the block LIVES ON (the doc root, or its containing
  // `column`) — the same surface-generalization as the other root-walkers in
  // this range (`surfaceChildrenAt` / `nearestBodyBlock`, schema/bodySurface).
  // A root-only walk never matched an in-column pos (selfIdx -1 → single
  // block), so dragging an in-column chain head out of its column orphaned
  // the deeper children at a depth with no parent.
  const surface = surfaceChildrenAt(doc, pos)
  if (!surface) return { from: pos, to: pos + node.nodeSize }

  let selfIdx = -1
  let walked = surface.start
  for (let i = 0; i < surface.node.childCount; i++) {
    if (walked === pos) {
      selfIdx = i
      break
    }
    walked += surface.node.child(i).nodeSize
  }
  if (selfIdx === -1) return { from: pos, to: pos + node.nodeSize }

  let to = pos + node.nodeSize
  for (let i = selfIdx + 1; i < surface.node.childCount; i++) {
    const sib = surface.node.child(i)
    if (!structuralTypes.has(sib.type.name)) break
    const d = typeof sib.attrs.depth === "number" ? sib.attrs.depth : 0
    if (d <= selfDepth) break
    to += sib.nodeSize
  }
  return { from: pos, to }
}
