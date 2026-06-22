// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { setupResizeGesture } from "./gesture"
import { EMPTY_RESIZE_STATE, resizeKey, type ResizeState } from "./state"

export { getResizeState, resizeKey } from "./state"
export type { ResizeState } from "./state"

export const BlockResize = Extension.create({
  name: "blockResize",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<ResizeState>({
        key: resizeKey,
        state: {
          init: () => EMPTY_RESIZE_STATE,
          apply(tr, prev) {
            const meta = tr.getMeta(resizeKey) as ResizeState | undefined
            if (meta) return meta
            return prev
          },
        },
        view(view) {
          const teardown = setupResizeGesture(view, editor)
          return {
            destroy() {
              teardown()
            },
          }
        },
      }),
    ]
  },
})
