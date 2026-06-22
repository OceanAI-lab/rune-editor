// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { DeclarativeBlockExtension } from "./types"

/**
 * Identity helper that gives the call site a name, IDE autocomplete on
 * `keyboardShortcuts` keys, and type-narrowing for `inputRules` `replace`
 * callbacks. The returned object is the input verbatim — no runtime
 * transformation. The factory's `createBlockSpec` reads it from the
 * `extensions` field of the block config and compiles it during
 * `addExtensions()`.
 *
 * @example
 * ```ts
 * createBlockSpec({
 *   type: "heading",
 *   ...,
 *   extensions: [
 *     createBlockExtension({
 *       key: "heading-shortcuts",
 *       keyboardShortcuts: {
 *         "Mod-Alt-1": ({ editor }) => editor.commands.setNode("heading", { level: 2 }),
 *       },
 *       inputRules: [
 *         { find: /^#\s$/, replace: () => ({ type: "heading", props: { level: 2 }}) },
 *       ],
 *     }),
 *   ],
 * })
 * ```
 */
export function createBlockExtension<T extends DeclarativeBlockExtension>(ext: T): T {
  return ext
}
