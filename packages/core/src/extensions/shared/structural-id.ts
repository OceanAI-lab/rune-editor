// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorState, Transaction } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { INTERNAL_NORMALIZATION_META } from "../internal-meta"

// Shared structural-id backfill, extracted from extensions/block-id.ts so
// multiple consumers can fill an id-style attribute on the nodes they own
// without each re-implementing the scan / collision / transaction dance.
//
// The logic is identical to block-id's original `computeIdPatches` /
// `buildBackfillTransaction`, lifted out and parameterized by:
//
//   - `attrName`      — which attr holds the id (block-id: "id"; column: "id").
//   - `nodePredicate` — which nodes to scan/patch.
//   - `generateId`    — id factory (block-id: nanoid(8); column: col_<nanoid(8)>).
//   - `extraMeta`     — optional extra meta keys to set true on the tr, each
//                       consumer's own tag (block-id's BLOCK_ID_META, columns'
//                       COLUMN_NORMALIZE_META). These are an output signal for
//                       any meta-aware consumer; they are NOT what stops the
//                       appendTransaction from looping. INTERNAL_NORMALIZATION_META
//                       + addToHistory=false are ALWAYS set.
//
// Loop termination is by convergence, not by a meta guard: once every matching
// node has a unique id, `computeIdPatches` returns [] and `buildBackfillTransaction`
// returns null, so no further tr is dispatched.
//
// Collision handling: a matching node whose id is null OR collides with an
// already-seen id of the same attr gets a freshly generated id. First
// writer of a given id keeps it; later duplicates are regenerated. This is
// what catches duplicate-block (Cmd-D) and cross-document paste.

export interface StructuralIdConfig {
  attrName: string
  nodePredicate: (node: ProseMirrorNode) => boolean
  generateId: () => string
  /** Extra meta keys set `true` on the backfill tr (each consumer's own tag). */
  extraMeta?: readonly string[]
}

export type StructuralIdPatch = { pos: number; id: string }

export function computeIdPatches(
  state: EditorState,
  config: StructuralIdConfig,
): StructuralIdPatch[] {
  const { attrName, nodePredicate, generateId } = config
  const seen = new Set<string>()
  const patches: StructuralIdPatch[] = []

  state.doc.descendants((node, pos) => {
    if (!nodePredicate(node)) return true
    const existing = node.attrs[attrName] as string | null
    if (existing && !seen.has(existing)) {
      seen.add(existing)
      return true
    }
    // null OR collision → assign a fresh id
    const id = generateId()
    seen.add(id)
    patches.push({ pos, id })
    return true
  })

  return patches
}

export function buildBackfillTransaction(
  state: EditorState,
  patches: StructuralIdPatch[],
  config: StructuralIdConfig,
): Transaction | null {
  if (patches.length === 0) return null
  const { attrName, extraMeta } = config
  const tr = state.tr
  let applied = 0
  for (const { pos, id } of patches) {
    const node = tr.doc.nodeAt(pos)
    if (!node) continue
    try {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attrName]: id })
      applied += 1
    } catch {
      // setNodeMarkup RE-CREATES the node and re-validates its content
      // expression. A node that is currently schema-invalid — e.g. an
      // id-less 1-column `columnLayout` (content `column{2,5}`) landed via
      // Node.fromJSON, which does NOT re-fit (setContent / collab) — throws
      // RangeError here BEFORE the owning normalization pass can repair it.
      // Skip it: structural normalization (e.g. ColumnsNormalization's
      // unwrap) fixes the shape in the same appendTransaction round, and
      // the backfill converges on the next. The failed call appends no
      // step, so the tr stays usable for the remaining patches.
      // Probed 2026-06-10: tr.setNodeAttribute (AttrStep) throws the
      // identical RangeError — replace's close() re-validates the joined
      // content — so swapping the step type is NOT an alternative fix.
    }
  }
  if (applied === 0) return null
  for (const key of extraMeta ?? []) tr.setMeta(key, true)
  tr.setMeta(INTERNAL_NORMALIZATION_META, true)
  tr.setMeta("addToHistory", false)
  return tr
}
