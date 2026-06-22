// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

const BLOCK_LIKE = new Set([
  "p", "div", "li", "td", "th", "tr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "section", "article",
])

/**
 * Walk an unknown HTML subtree and emit a flat list of paragraphs (and
 * known-tag block elements).
 *
 * Two emission modes, by tag class:
 *   - **Schema-known** (a tag declared by some block's parseDOM, e.g.
 *     `<table>`, `<ul>`, `<h2>`, `<p>`, `<blockquote>`): emit the topmost
 *     occurrence WHOLE and claim all its descendants. This preserves
 *     self-contained block structure (a `<table>` is one node, not torn
 *     into orphan `<td>`s).
 *   - **BLOCK_LIKE only** (semantic block-like wrappers PM doesn't have
 *     a node for, e.g. `<div>`, `<section>`, `<article>`, plus the cell
 *     fallbacks `<li>`, `<td>`, `<th>`, `<tr>` when their containing
 *     schema-known parent isn't in the subtree): "deepest-only" — defer
 *     if a useful descendant exists, otherwise wrap inner content in
 *     `<p>`. Produces "<div><div><p>x</p></div></div>" → one `<p>`, not
 *     three.
 *
 * Marks inside an unknown subtree survive via `innerHTML`; PM's
 * DOMParser will match them against schema mark rules downstream.
 */
export function degradeToParagraphs(el: Element, knownBlockTags: Set<string>): Element[] {
  // CSS selector matching every "useful" tag — used to ask each candidate
  // "do you have any useful descendant?" via querySelector (matches descendants
  // only, not self — exactly what we want).
  const usefulSelector = [...knownBlockTags, ...BLOCK_LIKE].join(",")
  const ownerDoc = el.ownerDocument!
  const out: Element[] = []
  // Descendants of an already-emitted schema-known block are "claimed";
  // skip them so we don't re-emit nested content as orphans (e.g. emit
  // <table> whole, then walking <tr>/<td> would otherwise re-emit them).
  const claimed = new WeakSet<Element>()

  for (const desc of Array.from(el.querySelectorAll("*"))) {
    if (claimed.has(desc)) continue
    const tag = desc.tagName.toLowerCase()
    const isKnown = knownBlockTags.has(tag)
    const isBlockLike = BLOCK_LIKE.has(tag)
    if (!isKnown && !isBlockLike) continue

    if (isKnown) {
      // Topmost-known wins — emit whole, claim every descendant.
      out.push(desc.cloneNode(true) as Element)
      desc.querySelectorAll("*").forEach((d) => claimed.add(d))
      continue
    }

    // BLOCK_LIKE only: deepest-only paragraph wrap.
    if (desc.querySelector(usefulSelector)) continue
    const p = ownerDoc.createElement("p")
    p.innerHTML = desc.innerHTML
    if (!isWhitespaceOnly(p)) out.push(p)
  }

  if (out.length === 0) {
    const p = ownerDoc.createElement("p")
    p.innerHTML = el.innerHTML
    return isWhitespaceOnly(p) ? [] : [p]
  }
  return out
}

export function isWhitespaceOnly(el: Element): boolean {
  // `&nbsp;` ( ) is NOT trimmed by .trim(); use \s replace.
  return el.textContent!.replace(/\s/g, "") === ""
}
