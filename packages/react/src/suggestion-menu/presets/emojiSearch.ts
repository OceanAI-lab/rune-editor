// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export const DEFAULT_EMOJIBASE_URL = "https://cdn.jsdelivr.net/npm/emojibase-data"
const LOCALE = "en"

/** A single emoji match: the glyph and its human label. */
export interface EmojiResult {
  emoji: string
  label: string
}

/** Shape of an Emojibase `data.json` entry (only the fields we read). */
interface RawEmoji {
  label: string
  emoji: string
  tags?: string[]
  /** Emojibase group index; `2` is the "component" group (skin-tone / hair
   *  modifiers like 🏻) — not standalone picks, so we drop it. */
  group?: number
}

interface EmojiEntry {
  emoji: string
  label: string
  /** `label` lower-snake-cased (`grinning face` → `grinning_face`). The
   *  Emojibase `data.json` carries no shortcodes (the Vite emojibase helper
   *  only serves `data.json` + `messages.json`), so we derive one for
   *  `:grinning_face`-style matches and lean on `tags` for the rest. */
  shortcode: string
  tags: string[]
}

// Module-level cache keyed by base URL — the corpus is fetched once per
// session and reused across every open of the picker. SUCCESSFUL loads
// only: a rejected fetch deletes its entry so a retry refetches (a cached
// rejection would wedge the picker permanently after one network blip).
const indexCache = new Map<string, Promise<EmojiEntry[]>>()

function buildIndex(raw: RawEmoji[]): EmojiEntry[] {
  const out: EmojiEntry[] = []
  for (const e of raw) {
    if (!e.emoji || !e.label) continue
    if (e.group === 2) continue // component modifiers
    // The 26 "regional indicator X" letters match `:a`…`:z` as noise.
    if (/^regional indicator\b/i.test(e.label)) continue
    const shortcode = e.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
    out.push({ emoji: e.emoji, label: e.label, shortcode, tags: e.tags ?? [] })
  }
  return out
}

/**
 * Fetch + index the Emojibase corpus for a base URL (cached per session).
 * REJECTS on fetch/parse failure so the caller can surface a retryable error
 * state rather than silently showing an empty grid.
 */
export function loadEmojiIndex(emojibaseUrl: string | undefined): Promise<EmojiEntry[]> {
  const base = emojibaseUrl ?? DEFAULT_EMOJIBASE_URL
  const cached = indexCache.get(base)
  if (cached) return cached
  const pending = fetch(`${base}/${LOCALE}/data.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`emojibase data.json → ${r.status}`)
      return r.json() as Promise<RawEmoji[]>
    })
    .then(buildIndex)
    .catch((err: unknown) => {
      indexCache.delete(base)
      throw err
    })
  indexCache.set(base, pending)
  return pending
}

// Lower score = better match. The tiers go from most to least specific so a
// `:smile` query surfaces the literal "smile" emoji above "smiling face with
// …" variants, and tag hits sort below name hits. `Infinity` = no match.
function score(entry: EmojiEntry, q: string): number {
  if (entry.shortcode === q || entry.label === q) return 0
  if (entry.shortcode.startsWith(q)) return 1
  if (entry.label.startsWith(q)) return 2
  if (entry.shortcode.split("_").some((w) => w.startsWith(q))) return 3
  if (entry.tags.some((t) => t === q)) return 4
  if (entry.tags.some((t) => t.startsWith(q))) return 5
  if (entry.shortcode.includes(q)) return 6
  if (entry.tags.some((t) => t.includes(q))) return 7
  return Number.POSITIVE_INFINITY
}

/**
 * Rank ALL matches for a query against an already-loaded index — no cap, so
 * broad queries stay fully scrollable. Ties break on the corpus order
 * (Emojibase's own ordering), threaded through as the source index.
 */
export function filterEmojis(index: EmojiEntry[], query: string): EmojiResult[] {
  const q = query.trim().toLowerCase().replace(/:/g, "")
  if (!q) return []
  const scored: Array<{ entry: EmojiEntry; s: number; i: number }> = []
  index.forEach((entry, i) => {
    const s = score(entry, q)
    if (s !== Number.POSITIVE_INFINITY) scored.push({ entry, s, i })
  })
  scored.sort((a, b) => a.s - b.s || a.i - b.i)
  return scored.map(({ entry }) => ({ emoji: entry.emoji, label: entry.label }))
}
