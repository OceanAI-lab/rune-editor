// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension, type Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { getBlockSpecs, isStructuralIndentType } from "../../schema"
import { nearestBodyBlock } from "../../schema/bodySurface"
import { DEFAULT_INDENT } from "../../schema/blocks/createSpec"

function convertListBlockToParagraph(editor: Editor, pos: number, block: ProseMirrorNode): boolean {
  const id = block.attrs.id as string | undefined
  if (!id) return false
  const paragraphType = editor.state.schema.nodes.paragraph
  if (!paragraphType) return false

  const attrs = {
    ...block.attrs,
    id,
    depth: (block.attrs.depth as number | undefined) ?? 0,
  }
  const paragraph = paragraphType.create(attrs, block.content, block.marks)
  const tr = editor.state.tr.replaceWith(pos, pos + block.nodeSize, paragraph)
  tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export const Indent = Extension.create({
  name: "indent",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const editor = this.editor
        const { state } = editor
        const $from = state.selection.$from
        if ($from.depth < 1) return false
        const nearest = nearestBodyBlock(editor, $from)
        if (!nearest) return false
        const block = nearest.node
        const config = getBlockSpecs(editor)[block.type.name]?.indent ?? DEFAULT_INDENT
        const changed = editor.commands.indentBlock()
        if (config.mode === "structural" || config.mode === "follow-prev") return true
        return changed
      },
      "Shift-Tab": () => {
        return this.editor.commands.outdentBlock()
      },
      Enter: () => {
        const editor = this.editor
        const { state } = editor
        const $from = state.selection.$from
        if ($from.depth < 1) return false
        const nearest = nearestBodyBlock(editor, $from)
        if (!nearest) return false
        const block = nearest.node
        const isEmpty = block.content.size === 0
        const isListBlock = isStructuralIndentType(editor, block.type.name)

        // Non-empty list block → split into a new same-kind sibling.
        // PM's default splitBlock falls back to `paragraph` (schema default)
        // and drops the user out of the list. Issue #188.
        if (!isEmpty && isListBlock) {
          return editor.commands.splitListBlock()
        }

        if (!isEmpty) return false

        const depth = (block.attrs.depth as number | undefined) ?? 0
        if (depth > 0) {
          return editor.commands.outdentBlock()
        }
        if (isListBlock) {
          return convertListBlockToParagraph(editor, nearest.pos, block)
        }
        return false
      },
      Backspace: () => {
        const editor = this.editor
        const { state } = editor
        const $from = state.selection.$from
        if ($from.depth < 1) return false
        if ($from.parentOffset !== 0) return false
        const nearest = nearestBodyBlock(editor, $from)
        if (!nearest) return false
        const block = nearest.node
        const depth = (block.attrs.depth as number | undefined) ?? 0
        const isEmpty = block.content.size === 0
        const isListBlock = isStructuralIndentType(editor, block.type.name)

        // Notion-style "exit the list": Backspace at start of an empty
        // list item converts the block to a paragraph at the SAME depth.
        // Subsequent Backspaces fall through to the outdent step below
        // and gradually reduce indent, ending at a plain paragraph.
        //
        // This intentionally differs from Enter, which on an empty list
        // item *stays* in the list and outdents one level (or, at
        // depth=0, converts to paragraph). Enter expresses "keep going,
        // just less indented"; Backspace expresses "I'm done with this
        // list", so they take different first steps.
        if (isEmpty && isListBlock) {
          return convertListBlockToParagraph(editor, nearest.pos, block)
        }

        if (depth <= 0) return false
        return editor.commands.outdentBlock()
      },
    }
  },
})
