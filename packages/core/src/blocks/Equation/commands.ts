// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RawCommands } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { mathControllerKey } from "../../inlines/InlineMath/controller"
import { nearestBodyBlock } from "../../schema/bodySurface"

export interface InsertEquationBlockOptions {
  latex?: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    equationBlock: {
      insertEquationBlock: (options?: InsertEquationBlockOptions) => ReturnType
    }
  }
}

export function equationBlockCommands(): Partial<RawCommands> {
  return {
    insertEquationBlock:
      (options = {}) =>
      ({ editor, state, dispatch }) => {
        if (!editor.isEditable) return false
        const type = state.schema.nodes.equationBlock
        if (!type) return false
        if (!dispatch) return true

        const $from = state.selection.$from
        // We always work at the top level (depth 1 = direct child of
        // doc). If selection is deeper (inside a table cell, list item,
        // etc.), bail — slash menu will have replaced the parent block
        // by this point.
        if ($from.depth < 1) return false

        const nearest = nearestBodyBlock(editor, $from)
        if (!nearest) return false
        const blockNode = nearest.node
        const blockStart = nearest.pos
        const blockEnd = nearest.pos + blockNode.nodeSize
        const node = type.create({ latex: options.latex ?? "" })
        const paragraphType = state.schema.nodes.paragraph

        const replaceEmpty =
          blockNode.type.name === "paragraph" && blockNode.content.size === 0
        const insertPos = replaceEmpty ? blockStart : blockEnd

        const tr = replaceEmpty
          ? state.tr.replaceWith(blockStart, blockEnd, node)
          : state.tr.insert(blockEnd, node)

        // Insert a trailing paragraph after the atom so the user can
        // keep typing after Done — matches Divider/atom behavior in
        // `insertOrUpdateBlockForSlashMenu` (see
        // packages/core/src/extensions/suggestion-menus/default-items/
        // insertOrUpdateBlockForSlashMenu.ts:38-42). Without this, the
        // equation is the last block in the doc and there's no caret
        // landing zone afterwards.
        const afterEquation = insertPos + node.nodeSize
        if (paragraphType) {
          tr.insert(afterEquation, paragraphType.create())
        }

        // Selection stays on the equation block (NodeSelection) so the
        // mathControllerKey intent (set below) targets the right pos.
        // After commit, the popover closes and downstream code can
        // setSelection to the trailing paragraph if desired.
        tr.setSelection(NodeSelection.create(tr.doc, insertPos))
        tr.setMeta(mathControllerKey, { type: "open", pos: insertPos })
        dispatch(tr.scrollIntoView())
        return true
      },
  }
}
