// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import { getSuggestionMenus } from "./getSuggestionMenus";
import type { FrequencyEntry, FrequencyMap } from "./types";

export type { FrequencyEntry, FrequencyMap };

const DERIVED_ITEM_SUFFIXES = ["__turn-into"] as const;

export function suggestionFrequencyKey(itemKey: string): string {
  for (const suffix of DERIVED_ITEM_SUFFIXES) {
    if (itemKey.endsWith(suffix)) return itemKey.slice(0, -suffix.length);
  }
  return itemKey;
}

/**
 * Bump the usage stats for a slash-menu item under a given trigger. Called
 * after the user commits an item. State lives on `editor.storage` and dies
 * with the editor instance — hosts that want session-spanning persistence
 * should serialize `getSuggestionFrequency(editor, trigger)` themselves and
 * rehydrate on init via direct mutation of the same storage.
 */
export function recordSuggestionUse(
  editor: Editor,
  triggerCharacter: string,
  itemKey: string,
  now: number = Date.now(),
): void {
  const storage = getSuggestionMenus(editor);
  const map = (storage.frequency[triggerCharacter] ??= {});
  const key = suggestionFrequencyKey(itemKey);
  const prev = map[key];
  map[key] = {
    count: (prev?.count ?? 0) + 1,
    lastUsedAt: now,
  };
}

export function getSuggestionFrequency(
  editor: Editor,
  triggerCharacter: string,
): FrequencyMap {
  return getSuggestionMenus(editor).frequency[triggerCharacter] ?? {};
}

/**
 * Sort items by recency (lastUsedAt desc), tie-broken by count desc, and
 * return the top `limit`. Items absent from the frequency map are dropped —
 * caller decides how to merge with the rest of the list.
 */
export function pickRecentlyUsed<T extends { key: string }>(
  items: T[],
  freq: FrequencyMap,
  limit: number,
): T[] {
  if (limit <= 0) return [];
  const scored: Array<{ item: T; entry: FrequencyEntry }> = [];
  for (const item of items) {
    const entry = freq[suggestionFrequencyKey(item.key)];
    if (entry) scored.push({ item, entry });
  }
  scored.sort(
    (a, b) =>
      b.entry.lastUsedAt - a.entry.lastUsedAt ||
      b.entry.count - a.entry.count,
  );
  return scored.slice(0, limit).map((s) => s.item);
}
