// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Schema } from "@tiptap/pm/model"

/**
 * Collects the set of HTML tag names that any block-level node in the
 * schema can parse. Used by transformPastedHTML to decide which top-level
 * elements to keep as-is during paste preprocessing.
 *
 * Source = `schema.nodes` (not the rune `forEachBlockSpec` registry):
 * this covers Tiptap-shipped block extensions like HorizontalRule and any
 * consumer who escape-hatches via raw `Node.create`. The rune registry
 * remains the source of truth for rune-managed concerns (slash menu,
 * `clipboardRenderDOM` lookup) — different concerns, both kept.
 *
 * `parseDOM[].tag` may be a CSS selector (e.g. "div[data-type=callout]"
 * or "ul > li"); we extract the leading bare tag name with a regex.
 *
 * Narrowed selectors like `div[data-rune-toggle-level]`, `p.note`, or
 * `[data-rune-toggle-title]` do NOT contribute their leading tag to this
 * set. Those rules only claim specific variants of the tag — preserving
 * every `<div>` on paste would leak unrelated wrappers (e.g. Notion's
 * `<div data-block-id="…">`) through the paste pipeline. Narrow rules
 * still match downstream via PM's DOMParser; this set is just the
 * coarse-grained "any `<tag>` should survive paste preprocessing" claim.
 */
export function collectKnownBlockTags(schema: Schema): Set<string> {
  const tags = new Set<string>()
  for (const nodeType of Object.values(schema.nodes)) {
    if (!nodeType.isBlock) continue
    const rules = nodeType.spec.parseDOM
    if (!rules) continue
    for (const rule of rules) {
      if (typeof rule.tag !== "string") continue
      // Allow hyphens for custom-element tag names (e.g. "foo-block").
      // The leading character must be a letter so we don't match a CSS
      // selector that begins with `[` or `.`.
      const match = rule.tag.match(/^([a-zA-Z][a-zA-Z0-9-]*)(.*)$/)
      if (!match) continue
      const name = match[1]
      const rest = match[2] ?? ""
      if (name === undefined) continue
      // Reject narrowed selectors: anything immediately following the tag
      // that isn't whitespace or a combinator (`>`, `+`, `~`) qualifies
      // the rule to a specific variant. `tag[attr]`, `tag.class`,
      // `tag#id`, `tag:pseudo` → skip. `tag > child`, `tag descendant` →
      // keep (the leading tag is the natural top-level container).
      if (rest !== "" && !/^[\s>+~]/.test(rest)) continue
      tags.add(name.toLowerCase())
    }
  }
  return tags
}
