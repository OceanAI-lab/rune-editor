// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Read a list block's depth attribute from its parseDOM element.
 *
 * Prefers `data-rune-paste-depth` (set by the paste pipeline's list
 * flattener — see `clipboard/transformPastedHTML`) over `data-depth`
 * (the round-trip attribute emitted by `createSpec`). Returns 0 for
 * missing / malformed / negative values.
 */
export function parseListDepth(el: HTMLElement): number {
  const raw = el.getAttribute("data-rune-paste-depth") ?? el.getAttribute("data-depth")
  const depth = raw == null ? 0 : Number.parseInt(raw, 10)
  return Number.isFinite(depth) && depth >= 0 ? depth : 0
}
