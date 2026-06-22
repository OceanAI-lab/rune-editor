// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"
import { collectBlockTargets, type BlockTarget } from "./collectBlockTargets"

function planOutdent(block: BlockTarget): { changed: boolean; newDepth: number } {
  const currentDepth = (block.node.attrs.depth as number | undefined) ?? 0
  if (currentDepth <= 0) return { changed: false, newDepth: 0 }
  return { changed: true, newDepth: currentDepth - 1 }
}

export function outdentBlockImpl(
  id: string | undefined,
): (args: { editor: Editor; state: EditorState; dispatch: ((tr: any) => void) | undefined }) => boolean {
  return ({ editor, state, dispatch }) => {
    const targets = collectBlockTargets(editor, state.selection, id)
    if (targets.length === 0) return false
    const plans = targets.map((t) => ({ target: t, plan: planOutdent(t) }))
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
