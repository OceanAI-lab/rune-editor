// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Plugin, PluginKey } from "@tiptap/pm/state"
export interface MathControllerState {
  openTarget: number | null
  setAt: number
}

export type MathControllerMeta =
  | { type: "open"; pos: number }
  | { type: "consume" }

export const mathControllerKey = new PluginKey<MathControllerState>("rune-math-controller")

export const MathController = new Plugin<MathControllerState>({
  key: mathControllerKey,
  state: {
    init: () => ({ openTarget: null, setAt: 0 }),
    apply(tr, prev) {
      const meta = tr.getMeta(mathControllerKey) as MathControllerMeta | undefined
      if (meta?.type === "open") {
        return { openTarget: meta.pos, setAt: tr.time }
      }
      if (meta?.type === "consume") {
        return { openTarget: null, setAt: prev.setAt }
      }

      if (tr.getMeta("y-sync$") || tr.getMeta("collab$")) {
        return { openTarget: null, setAt: prev.setAt }
      }

      if (prev.openTarget === null) return prev

      const mapped = tr.mapping.mapResult(prev.openTarget, -1)
      if (mapped.deleted) return { openTarget: null, setAt: prev.setAt }
      return { openTarget: mapped.pos, setAt: prev.setAt }
    },
  },
})
