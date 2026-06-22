// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// `position: fixed` containing block (CB) detection + viewport-to-CB-local
// coordinate mapping. Used by preview positioning so the wrapper aligns
// pixel-perfect with the source under any CB-creating ancestor (transform,
// filter, perspective, contain, will-change).

/**
 * Walk from `el` upward (inclusive of `el` itself) and return the nearest
 * element that establishes a containing block for fixed-positioned
 * descendants — i.e. has transform / filter / perspective / contain
 * (layout|paint|strict) / will-change (transform|filter|perspective).
 * Return null if none — the CB is then the viewport.
 *
 * Why include `el` itself: callers pass the preview's parent (`.rune-editor`).
 * If `.rune-editor` itself has the CB-creating property, IT is the CB, not
 * one of its ancestors.
 */
export function findContainingBlock(el: HTMLElement): HTMLElement | null {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e)
    // Guard against browsers/jsdom returning "" for unset properties instead of "none".
    if (cs.transform && cs.transform !== "none") return e
    if (cs.filter && cs.filter !== "none") return e
    if (cs.perspective && cs.perspective !== "none") return e
    if (/\b(layout|paint|strict)\b/.test(cs.contain)) return e
    if (/transform|filter|perspective/.test(cs.willChange)) return e
  }
  return null
}

/**
 * Map a viewport-coordinate point (x, y) into `cb`'s local coordinate space
 * — i.e. the coordinate space that `position: fixed; top/left:` resolves
 * against when the element lives inside `cb`. Inverts `cb`'s 2D transform
 * matrix so this works uniformly for identity / translate / scale / rotate.
 *
 * `cb === null` means the CB is the viewport — identity mapping.
 */
export function viewportToCBLocal(
  cb: HTMLElement | null,
  x: number,
  y: number,
): { x: number; y: number } {
  if (!cb) return { x, y }
  const r = cb.getBoundingClientRect()
  const m = new DOMMatrix(getComputedStyle(cb).transform)
  const p = m.inverse().transformPoint(new DOMPoint(x - r.left, y - r.top))
  return { x: p.x, y: p.y }
}
