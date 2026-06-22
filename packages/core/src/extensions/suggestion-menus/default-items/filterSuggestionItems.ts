// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Score higher = better match. Used by the literal pass; the fuzzy
// fallback runs only when this pass produces zero hits, so it lives
// outside the score system.
const SCORE_TITLE_EXACT = 4;
const SCORE_TITLE_PREFIX = 3;
const SCORE_TITLE_SUBSTR = 2;
const SCORE_ALIAS = 1;
const SCORE_MISS = 0;

export function filterSuggestionItems<
  T extends { title: string; aliases?: string[] },
>(items: T[], query: string): T[] {
  if (!query) return items.slice();
  const q = query.toLowerCase();

  // Pass 1 — literal tiers. Anything that hits here is the user's
  // intended result; we never dilute it with fuzzy approximations.
  const scored: Array<{ item: T; score: number; idx: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const t = item.title.toLowerCase();
    let score: number = SCORE_MISS;
    if (t === q) score = SCORE_TITLE_EXACT;
    else if (t.startsWith(q)) score = SCORE_TITLE_PREFIX;
    else if (t.includes(q)) score = SCORE_TITLE_SUBSTR;
    else if (item.aliases?.some((a) => a.toLowerCase().includes(q))) score = SCORE_ALIAS;
    if (score > SCORE_MISS) scored.push({ item, score, idx: i });
  }
  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return scored.map((s) => s.item);
  }

  // Pass 2 — fuzzy fallback, only when pass 1 produced nothing. This
  // is the "typo lifeline" tier: gives a credible result set so the
  // menu doesn't blank out on a single-key mistake, but never competes
  // with literal hits and never reorders them. Rules:
  //   - First-char anchored (case-insensitive): the corrected match
  //     must share the opening character. Without this anchor "xej"
  //     pulls in "heading"; with it, only h-titles are even considered.
  //   - Compare q against the same-length title prefix. Users type
  //     left-to-right; matching mid-title chars would let "ading" pull
  //     "Heading 1", which feels random.
  //   - Aliases are excluded. They're short keyboard shortcuts where
  //     a one-character edit could flip "h1" → "h2" → wrong block;
  //     better to leave them strict.
  const fuzzyBudget = fuzzyTolerance(q.length);
  if (fuzzyBudget === 0) return [];
  const fuzzy: Array<{ item: T; idx: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const t = item.title.toLowerCase();
    if (t.length === 0 || t.charCodeAt(0) !== q.charCodeAt(0)) continue;
    const prefix = t.slice(0, q.length);
    if (editDistance(q, prefix, fuzzyBudget) <= fuzzyBudget) {
      fuzzy.push({ item, idx: i });
    }
  }
  // No score tie-break needed in pass 2: every item is the same tier,
  // so we just preserve source order so the slash menu stays predictable.
  return fuzzy.map((f) => f.item);
}

// Budget scales with query length: a 3-char query can absorb one typo,
// a 7-char query up to two, etc. Step values picked so that the most
// common typo case (one wrong character in the middle/end of a word)
// is forgiven even on short queries, but short queries don't pull in
// totally unrelated titles. Anything shorter than 2 chars returns 0 —
// a single-char fuzzy radius would basically match everything.
function fuzzyTolerance(qLen: number): number {
  if (qLen < 2) return 0;
  if (qLen <= 4) return 1;
  if (qLen <= 8) return 2;
  return 3;
}

// Levenshtein distance with two rolling rows and two cutoffs:
//   - length-diff pre-check: |a|-|b| already exceeds the budget, so
//     even free insertions/deletions can't close the gap → bail.
//   - row-min pruning: if the smallest value in the current row already
//     exceeds the budget, no continuation of that row can finish under
//     it. Bail (returns budget+1, which the caller treats as a miss).
// Both keep the worst-case to budget*max(|a|,|b|) ops in practice
// instead of full |a|*|b|. Strings here are short enough (title prefix
// ≤ query length ≤ a handful of chars) that this is overkill, but the
// pruning costs nothing and keeps the helper honest if reused later.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[m]!;
}
