// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorState } from "@tiptap/pm/state"
import { PluginKey } from "@tiptap/pm/state"

export interface ResizeState {
  activeBlockId: string | null
  dragWidth: number | null
}

export const EMPTY_RESIZE_STATE: ResizeState = {
  activeBlockId: null,
  dragWidth: null,
}

export const resizeKey = new PluginKey<ResizeState>("rune-resize")

export function getResizeState(state: EditorState): ResizeState {
  return resizeKey.getState(state) ?? EMPTY_RESIZE_STATE
}
