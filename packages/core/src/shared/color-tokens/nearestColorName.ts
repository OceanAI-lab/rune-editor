// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Map any CSS color (hex / rgb / rgba) to the closest palette name by
// PERCEPTUAL distance (CIE76 ΔE in L*a*b*). Returns null if the input can't
// be parsed.
//
// Why L*a*b* and not raw RGB L2: RGB distance is hue-blind. A light, slightly
// red-leaning blue (e.g. #83abe1) sits — in raw RGB — nearer a darker purple
// than the palette's own (darker, purer) blue, so it misclassifies as purple.
// L*a*b* puts hue in (a*,b*) and lightness in L*, so shades of one hue stay
// with that hue, while same-hue/different-value pairs (brown vs orange) still
// separate by L*. The mapping must survive palette re-measurement without the
// nearest-neighbor decision "straddling" into an adjacent hue.
//
// Variant picks which channel of the palette to compare against:
//   "text"       → COLORS[name].fg (paste source is the CSS `color` prop)
//   "background" → COLORS[name].bg

import { COLORS, COLOR_NAMES, type ColorName } from "./colors"
import { parseCssColor, type Rgb } from "./parseCssColor"

type Variant = "text" | "background"
type Lab = readonly [L: number, a: number, b: number]

// sRGB 8-bit channel → linear-light [0,1] (inverse companding).
function channelToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

// CIELAB f(t) with the standard ε = 216/24389, κ = 24389/27.
function pivot(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
}

// sRGB → CIE L*a*b* under the D65 white point.
function rgbToLab({ r, g, b }: Rgb): Lab {
  const rl = channelToLinear(r)
  const gl = channelToLinear(g)
  const bl = channelToLinear(b)
  // linear sRGB → XYZ, each axis normalized by the D65 reference white.
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883
  const fx = pivot(x)
  const fy = pivot(y)
  const fz = pivot(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function nearestColorName(input: string, variant: Variant): ColorName | null {
  const target = parseCssColor(input)
  if (!target) return null
  const [tl, ta, tb] = rgbToLab(target)

  let best: ColorName | null = null
  let bestDist = Infinity
  for (const name of COLOR_NAMES) {
    if (name === "default") continue
    const hex = variant === "text" ? COLORS[name].fg : COLORS[name].bg
    const rgb = parseCssColor(hex)
    if (!rgb) continue
    const [l, a, b] = rgbToLab(rgb)
    const dl = l - tl
    const da = a - ta
    const db = b - tb
    const dist = dl * dl + da * da + db * db // ΔE² (CIE76); sqrt is monotonic
    if (dist < bestDist) {
      bestDist = dist
      best = name
    }
  }
  return best
}
