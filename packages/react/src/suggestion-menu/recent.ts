// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { pickRecentlyUsed, type FrequencyMap } from "@ocai/rune-core";

export const RECENTS_LIMIT = 5;
export const RECENTS_GROUP_LABEL = "Recently used";

export function withRecentlyUsedGroup<T extends { key: string; group?: string }>(
  items: T[],
  frequency: FrequencyMap,
  limit: number = RECENTS_LIMIT,
): T[] {
  const recents = pickRecentlyUsed(items, frequency, limit).map((item) => ({
    ...item,
    group: RECENTS_GROUP_LABEL,
  }));

  if (recents.length === 0) return items;

  const recentKeys = new Set(recents.map((item) => item.key));
  return [
    ...recents,
    ...items.filter((item) => !recentKeys.has(item.key)),
  ] as T[];
}
