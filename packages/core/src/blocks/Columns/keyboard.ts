// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { ResolvedPos } from "@tiptap/pm/model"

export const columnsKeyboardKey = new PluginKey("rune-columns-keyboard")

/**
 * Depth of the nearest `column` ancestor of `$pos`, or `-1` when the caret is
 * not inside a column. Pure node-tree walk over the resolved position's depth
 * stack — no editor / registry (pitfall 2: `handleKeyDown(view)` has no
 * editor). A `column` only ever sits one structural level below a
 * `columnLayout`, but we scan the whole chain so a future deeper surface still
 * resolves.
 */
function columnDepth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "column") return d
  }
  return -1
}

/**
 * Whether the caret sits at the very START of a column's FIRST body block —
 * the only position from which a Backspace could attempt to merge across the
 * column's leading boundary (into the previous column, or out of the layout).
 *
 * Conditions (all pure node-tree math):
 *   - the caret is inside a `column` (its depth stack contains one), and
 *   - the block holding the caret is the column's first child
 *     (`$from.index(cd) === 0`), and
 *   - the caret is at the absolute start of that block's content
 *     (`$from.pos === $from.start(cd) + 1`, i.e. one step past the column's
 *     content boundary — inside the first block).
 */
function isAtColumnFirstBlockStart($from: ResolvedPos): boolean {
  const cd = columnDepth($from)
  if (cd < 0) return false
  if ($from.index(cd) !== 0) return false
  // `$from.start(cd)` is the position just inside the column (after its open
  // token); +1 steps into the first child block's content start.
  return $from.pos === $from.start(cd) + 1
}

/**
 * Keyboard boundaries for `columnLayout`, shipped through the block's
 * `extensions: [...]` array (zero kit.ts special-casing). All logic is pure
 * node-tree + depth-attr math inside `handleKeyDown(view)` — no editor,
 * no registry (pitfall 2).
 *
 * Backspace at the very start of a column's first block is a NO-OP GUARD:
 * `column.isolating` already makes PM's `joinBackward` refuse to merge across
 * the boundary (verified — see creation/keyboard tests), so the caret never
 * pulls the previous column's content. But `isolating` only stops PM's
 * command; the BROWSER's native contentEditable backspace would still fire
 * because nothing consumed the event. We return `true` here to consume it,
 * so neither PM nor the browser merges across the column edge.
 *
 * ArrowLeft/Right/Up/Down and Enter are intentionally NOT handled — PM's
 * defaults already do the right thing inside an isolating column (arrows
 * cross the boundary without trapping; Enter at a column's last block splits
 * INSIDE the column). Those behaviors are pinned by tests, not re-implemented.
 */
export const ColumnsKeyboard = Extension.create({
  name: "columnsKeyboard",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: columnsKeyboardKey,
        props: {
          handleKeyDown(view, event) {
            if (event.key !== "Backspace") return false
            const { selection } = view.state
            if (!selection.empty) return false
            if (!isAtColumnFirstBlockStart(selection.$from)) return false
            // Consume the event: no-op so the column's leading boundary is
            // never crossed (neither PM joinBackward nor the browser native
            // backspace runs).
            event.preventDefault()
            return true
          },
        },
      }),
    ]
  },
})
