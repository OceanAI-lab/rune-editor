// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"

/**
 * Gutter `+` action: open the slash menu at an appropriate position.
 * Empty paragraph → `/` in-place. Any other block → insert a fresh
 * paragraph after, caret inside, `/` there.
 *
 * Goes through `editor.commands.openSlashMenu` (added by SuggestionMenus
 * in Task 5) — consumers get one public API for "open the slash menu
 * here", the gutter just drives it.
 */
export function addBlockBelowAndOpenSlash(editor: Editor, blockPos: number): void {
  const { state, view } = editor
  const $inner = state.doc.resolve(blockPos + 1)
  const block = $inner.parent
  const isEmptyParagraph =
    block.type.name === "paragraph" && block.content.size === 0

  if (isEmptyParagraph) {
    editor.commands.openSlashMenu({ pos: blockPos + 1 })
  } else {
    const topNode = state.doc.resolve(blockPos).nodeAfter
    if (!topNode) return
    const afterBlock = blockPos + topNode.nodeSize
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return

    view.dispatch(state.tr.insert(afterBlock, paragraphType.create()))
    editor.commands.openSlashMenu({ pos: afterBlock + 1 })
  }
  view.focus()
}
