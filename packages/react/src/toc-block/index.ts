// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export { tableOfContentsReactNodeView } from "./TableOfContentsNodeView"

import type { CreateRuneKitOptions } from "@ocai/rune-core"
import { tableOfContentsReactNodeView } from "./TableOfContentsNodeView"
import { audioBlockReactNodeView } from "../blocks/audio"

/**
 * Mirrors {@link reactMathNodeViews}. Returns the React-side default
 * for `createRuneKit({ blockNodeViews })`. `useRuneEditor` injects this
 * automatically; standalone Tiptap consumers can spread it themselves.
 */
export function reactBlockNodeViews(): NonNullable<CreateRuneKitOptions["blockNodeViews"]> {
  return {
    tableOfContents: tableOfContentsReactNodeView,
    audio: audioBlockReactNodeView,
  }
}
