// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Extension } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"

export const entityRefsRefreshKey = new PluginKey<EntityRefsRefreshMeta>(
  "rune-entity-refs-refresh",
)

export interface EntityRefsRefreshMeta {
  refType: string | null
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityRefs: {
      refreshEntityRefs: (refType?: string) => ReturnType
    }
  }
}

export const EntityRefs = Extension.create({
  name: "entityRefs",

  addCommands() {
    return {
      refreshEntityRefs:
        (refType?: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(entityRefsRefreshKey, { refType: refType ?? null })
          }
          return true
        },
    }
  },
})

export { createRefDecorationPlugin, isTargetedRefresh } from "./createRefDecorationPlugin"
export type { RefDecorationConfig } from "./createRefDecorationPlugin"
export { addMarkToAllowedInlineSelection } from "./addMarkToAllowedInlineSelection"
export { escapeCssString } from "./escapeCssString"
