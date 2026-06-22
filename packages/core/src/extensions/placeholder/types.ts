// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Node as PMNode } from "@tiptap/pm/model"

export type PlaceholderResolver = string | ((node: PMNode) => string)

/** Built-in block type names — the closed set of per-type keys accepted
 *  by `placeholders`. Mirrors `RuneBlock["type"]` (see `blocks/index.ts`);
 *  the duplication is intentional so this module doesn't pull in the
 *  full block barrel. Downstream blocks registered via `createBlockSpec`
 *  aren't in this union; misuse is caught at runtime by the init warn
 *  in `placeholder/index.ts`. See #178. */
export type RuneBlockTypeName =
  | "paragraph"
  | "heading"
  | "divider"
  | "bulletList"
  | "numberedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "table"
  | "toggle"

export type PlaceholderConfig = {
  /** Fallback for any focused empty block with no per-type override. */
  default?: PlaceholderResolver
  /** Reserved: the `emptyDocument` special case was removed. Declared as
   *  `never` so `placeholders={{ emptyDocument: "..." }}` is a compile
   *  error rather than silently accepted and then ignored at runtime. */
  emptyDocument?: never
} & Partial<Record<RuneBlockTypeName, PlaceholderResolver>>

/** Which resolution rule produced the hit. Surfaced via the
 *  `data-placeholder-state` decoration attr so CSS can target each
 *  state independently. */
export type PlaceholderState = "per-type" | "default"

export interface PlaceholderHit {
  /** Top-level block start position, where Decoration.node is applied. */
  pos: number
  node: PMNode
  text: string
  state: PlaceholderState
}

export interface PlaceholderPluginState {
  focused: boolean
}
