// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export const SUGGESTION_MENU_GROUP_ORDER = [
  "Recently used",
  "Filter results",
  "Basic blocks",
  "Media",
  "Other",
] as const;

const GROUP_RANK = new Map<string, number>(
  SUGGESTION_MENU_GROUP_ORDER.map((label, index) => [label, index]),
);

export type SuggestionMenuGroup<T> = {
  label: string | undefined;
  items: T[];
};

export function orderSuggestionMenuItems<T>(items: readonly T[]): T[] {
  return groupSuggestionMenuItems(items).flatMap((group) => group.items);
}

export function groupSuggestionMenuItems<T>(
  items: readonly T[],
): SuggestionMenuGroup<T>[] {
  const firstSeen = new Map<string | undefined, number>();
  const buckets = new Map<string | undefined, T[]>();

  items.forEach((item, index) => {
    const label = itemGroup(item);
    if (!buckets.has(label)) {
      buckets.set(label, []);
      firstSeen.set(label, index);
    }
    buckets.get(label)!.push(item);
  });

  return Array.from(buckets, ([label, groupedItems]) => ({
    label,
    items: groupedItems,
  })).sort((a, b) => {
    const ar = groupRank(a.label);
    const br = groupRank(b.label);
    return ar - br || firstSeen.get(a.label)! - firstSeen.get(b.label)!;
  });
}

function groupRank(label: string | undefined): number {
  if (label === undefined) return Number.MAX_SAFE_INTEGER;
  return GROUP_RANK.get(label) ?? SUGGESTION_MENU_GROUP_ORDER.length;
}

function itemGroup(item: unknown): string | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const group = (item as { group?: unknown }).group;
  return typeof group === "string" ? group : undefined;
}
