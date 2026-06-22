// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { MarkType } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"

/**
 * Apply `markType` (with `attrs`) across every inline node in the transaction's
 * current selection whose parent allows the mark, merging onto any existing
 * instance of the same type. Inline nodes carrying a mutually-exclusive mark
 * (one that excludes `markType` without `markType` excluding it back) are left
 * untouched. Returns whether anything was applied.
 *
 * Shared by the `wikiLink` / `internalRef` / link marks — they all need the
 * same "set this mark over a multi-node selection without clobbering disallowed
 * spots" behavior, which Tiptap's `setMark` does not provide directly.
 */
export function addMarkToAllowedInlineSelection(
  tr: Transaction,
  markType: MarkType,
  attrs: Record<string, unknown>,
): boolean {
  const { selection } = tr
  let applied = false

  for (const range of selection.ranges) {
    const from = range.$from.pos
    const to = range.$to.pos

    tr.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isInline) return true
      if (parent && !parent.type.allowsMarkType(markType)) return false

      const trimmedFrom = Math.max(pos, from)
      const trimmedTo = Math.min(pos + node.nodeSize, to)
      const existingMark = markType.isInSet(node.marks)
      if (
        !existingMark &&
        node.marks.some(
          (mark) => mark.type.excludes(markType) && !markType.excludes(mark.type),
        )
      ) {
        return true
      }
      if (existingMark) {
        tr.removeMark(trimmedFrom, trimmedTo, markType)
      }
      tr.addMark(
        trimmedFrom,
        trimmedTo,
        markType.create({ ...(existingMark?.attrs ?? {}), ...attrs }),
      )
      applied = true
      return true
    })
  }

  return applied
}
