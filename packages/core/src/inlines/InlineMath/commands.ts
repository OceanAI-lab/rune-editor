// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { RawCommands } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { mathControllerKey } from "./controller"

export interface InsertInlineMathOptions {
  latex?: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineMath: {
      insertInlineMath: (options?: InsertInlineMathOptions) => ReturnType
      wrapSelectionAsInlineMath: () => ReturnType
    }
  }
}

export function inlineMathCommands(): Partial<RawCommands> {
  return {
    insertInlineMath:
      (options = {}) =>
      ({ editor, state, dispatch }) => {
        if (!editor.isEditable) return false
        const type = state.schema.nodes.inlineMath
        if (!type || !state.selection.$from.parent.inlineContent) return false
        if (!dispatch) return true

        const pos = state.selection.from
        const node = type.create({ latex: options.latex ?? "" })
        const tr = state.tr.replaceSelectionWith(node)
        tr.setSelection(NodeSelection.create(tr.doc, pos))
        tr.setMeta(mathControllerKey, { type: "open", pos })
        dispatch(tr)
        return true
      },
    wrapSelectionAsInlineMath:
      () =>
      ({ editor, state, dispatch }) => {
        if (!editor.isEditable) return false
        const type = state.schema.nodes.inlineMath
        const { selection } = state
        if (!type || !(selection instanceof TextSelection) || selection.empty) {
          return false
        }
        if (!selection.$from.sameParent(selection.$to)) return false
        if (!selection.$from.parent.inlineContent) return false

        const latex = state.doc.textBetween(selection.from, selection.to)
        if (!dispatch) return true

        const pos = selection.from
        const tr = state.tr.replaceWith(pos, selection.to, type.create({ latex }))
        tr.setSelection(NodeSelection.create(tr.doc, pos))
        tr.setMeta(mathControllerKey, { type: "open", pos })
        dispatch(tr)
        return true
      },
  }
}
