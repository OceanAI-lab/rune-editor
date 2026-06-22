// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Parses a CSS color string into {r,g,b} in [0,255]. Supports:
//   - "#rgb"       → repeats each nibble (#abc → #aabbcc)
//   - "#rrggbb"
//   - "rgb(r,g,b)" / "rgb(r g b)" (whitespace-tolerant)
//   - "rgba(r,g,b,a)" (alpha dropped)
// Everything else — CSS named colors, "inherit", "transparent", garbage — returns null.
// nearestColorName() uses this as its only color-parse path, so CSS named
// colors get treated as "unparseable" and the caller falls back to null
// (== no color). This is intentional: we don't want to map "inherit" to a
// palette color.

export type Rgb = { r: number; g: number; b: number }

export function parseCssColor(input: string): Rgb | null {
  if (typeof input !== "string") return null
  const s = input.trim().toLowerCase()
  if (!s) return null

  if (s.startsWith("#")) {
    const hex = s.slice(1)
    if (hex.length === 3 && /^[0-9a-f]{3}$/.test(hex)) {
      const c0 = hex.slice(0, 1)
      const c1 = hex.slice(1, 2)
      const c2 = hex.slice(2, 3)
      const r = parseInt(c0 + c0, 16)
      const g = parseInt(c1 + c1, 16)
      const b = parseInt(c2 + c2, 16)
      return { r, g, b }
    }
    if (hex.length === 6 && /^[0-9a-f]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return { r, g, b }
    }
    return null
  }

  const match = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(s)
  if (match) {
    const r = Number(match[1])
    const g = Number(match[2])
    const b = Number(match[3])
    if ([r, g, b].every((v) => v >= 0 && v <= 255)) return { r, g, b }
  }
  return null
}
