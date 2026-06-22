// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// recentColors — session-scoped "recently used" tracking for the color
// palette, reusing core's pure `pickRecentlyUsed` ranker (the same one the
// slash / emoji menus use). State lives in a module-level WeakMap keyed by the
// Editor instance, so it survives the InlineToolbar mounting/unmounting across
// selections but dies with the editor — exactly matching the slash-menu
// frequency store, which is in-memory on editor.storage and NOT persisted
// across reloads. A host that wants cross-session persistence can serialize
// getColorFrequency() and rehydrate via recordColorUse() on init.

import type { Editor } from "@tiptap/core"
import {
  COLORS,
  pickRecentlyUsed,
  type FrequencyMap,
  type ColorName,
} from "@ocai/rune-core"

export type ColorKind = "text" | "background"

/** A recently-applied color, carrying which surface it was applied to so the
 *  recents row can re-apply it as the same kind (text vs background). */
export interface RecentColor {
  name: ColorName
  kind: ColorKind
}

/** Default number of swatches in the "Recently used" row (one 5-col line). */
export const RECENT_COLORS_LIMIT = 5

// Frequency map key = `${kind}:${name}` so the same color used as text and as
// background are tracked (and re-applied) independently. `default` (which
// clears the color) is never recorded — it isn't a "color" the user reaches
// back for.
const store = new WeakMap<Editor, FrequencyMap>()

function keyOf(kind: ColorKind, name: ColorName): string {
  return `${kind}:${name}`
}

function parseKey(key: string): RecentColor | null {
  const sep = key.indexOf(":")
  if (sep < 0) return null
  const kind = key.slice(0, sep)
  const name = key.slice(sep + 1) as ColorName
  if (kind !== "text" && kind !== "background") return null
  // Drop names absent from the current palette. The store is only fed valid
  // ColorNames in-app, but a host that persisted recents (getColorFrequency)
  // and rehydrated via recordColorUse can carry a since-renamed/removed color —
  // RecentRow would then read COLORS[name].label off undefined and crash.
  if (!(name in COLORS)) return null
  return { kind, name }
}

/** Bump usage stats for a (kind, color) pair. No-op for the `default` clearer. */
export function recordColorUse(
  editor: Editor,
  kind: ColorKind,
  name: ColorName,
  now: number = Date.now(),
): void {
  if (name === "default") return
  const map = store.get(editor) ?? {}
  const key = keyOf(kind, name)
  const prev = map[key]
  map[key] = { count: (prev?.count ?? 0) + 1, lastUsedAt: now }
  store.set(editor, map)
}

/** The raw frequency map (for host-owned persistence). */
export function getColorFrequency(editor: Editor): FrequencyMap {
  return store.get(editor) ?? {}
}

/** Top `limit` recently-used colors, most-recent first (ties by count). */
export function getRecentColors(
  editor: Editor,
  limit: number = RECENT_COLORS_LIMIT,
): RecentColor[] {
  const map = store.get(editor)
  if (!map) return []
  const items = Object.keys(map).map((key) => ({ key }))
  return pickRecentlyUsed(items, map, limit)
    .map((item) => parseKey(item.key))
    .filter((c): c is RecentColor => c !== null)
}
