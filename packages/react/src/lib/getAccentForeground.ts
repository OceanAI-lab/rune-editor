// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

function parseColor(color: string): [number, number, number] | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    const full =
      hex.length === 3
        ? hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!
        : hex
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ]
  }

  const match = color.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/,
  )
  if (match) {
    return [Number(match[1]), Number(match[2]), Number(match[3])]
  }

  return null
}

// WCAG relative luminance
function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/**
 * Given an accent color (hex or rgb string), returns `"white"` or `"black"`
 * for optimal contrast. Host apps call this and set the result as
 * `--editor-accent-foreground` on the editor root element.
 *
 * White wins whenever it clears WCAG's 3:1 non-text-contrast bar against the
 * accent (1.4.11, the UI-component threshold) — luminance > 0.30 ⇔
 * white-on-accent < 3:1. Don't lower the cutoff to the contrast-equality
 * point (0.179): black's WCAG ratio edges out white's mathematically there,
 * but that flips every mid-tone accent (#2383e2 blue included) to black text
 * where every real design system uses white.
 */
export function getAccentForeground(accentColor: string): "white" | "black" {
  const rgb = parseColor(accentColor)
  if (!rgb) return "white"
  return luminance(...rgb) > 0.3 ? "black" : "white"
}
