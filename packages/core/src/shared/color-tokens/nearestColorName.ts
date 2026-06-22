// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Map any CSS color (hex / rgb / rgba) to the closest palette name by
// straight-line RGB L2 distance. Returns null if the input can't be parsed
// or if "default" is the only candidate (it isn't; we skip it explicitly).
//
// Variant picks which channel of the palette to compare against:
//   "text"       → COLORS[name].fg (paste source is the CSS `color` prop)
//   "background" → COLORS[name].bg
//
// RGB L2 is coarser than LAB but the rune palette has 9 distinct colors
// spread across hue and value; nearest-neighbor decisions don't straddle.

import { COLORS, COLOR_NAMES, type ColorName } from "./colors"
import { parseCssColor } from "./parseCssColor"

type Variant = "text" | "background"

export function nearestColorName(input: string, variant: Variant): ColorName | null {
  const target = parseCssColor(input)
  if (!target) return null

  let best: ColorName | null = null
  let bestDist = Infinity
  for (const name of COLOR_NAMES) {
    if (name === "default") continue
    const hex = variant === "text" ? COLORS[name].fg : COLORS[name].bg
    const rgb = parseCssColor(hex)
    if (!rgb) continue
    const dr = rgb.r - target.r
    const dg = rgb.g - target.g
    const db = rgb.b - target.b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = name
    }
  }
  return best
}
