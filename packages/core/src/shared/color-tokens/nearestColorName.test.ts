// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { nearestColorName } from "./nearestColorName"
import { COLORS } from "./colors"

describe("nearestColorName", () => {
  it("exact palette text hex → that name (text variant)", () => {
    expect(nearestColorName("rgb(74, 124, 195)", "text")).toBe("blue")
    expect(nearestColorName("rgb(125, 122, 118)", "text")).toBe("gray")
    expect(nearestColorName("rgb(192, 89, 78)", "text")).toBe("red")
  })

  it("exact palette background hex → that name (background variant)", () => {
    expect(nearestColorName("rgb(40, 56, 78)", "background")).toBe("blue")
    expect(nearestColorName("rgb(56, 56, 54)", "background")).toBe("gray")
    expect(nearestColorName("rgb(75, 46, 42)", "background")).toBe("red")
  })

  it("near-miss text hex → some palette name (stable, in COLOR_NAMES)", () => {
    const result = nearestColorName("#ff00ff", "text")
    expect(result).not.toBeNull()
    expect(result).not.toBe("default")
    expect(COLORS[result!].fg).toBeDefined()
  })

  it("accepts rgb() and #rgb forms", () => {
    expect(nearestColorName("rgb(74, 124, 195)", "text")).toBe("blue")
    expect(nearestColorName("#abc", "text")).not.toBeNull()
  })

  it("returns null for unparseable input (and doesn't crash)", () => {
    expect(nearestColorName("", "text")).toBeNull()
    expect(nearestColorName("inherit", "text")).toBeNull()
    expect(nearestColorName("transparent", "background")).toBeNull()
    expect(nearestColorName("not a color", "text")).toBeNull()
  })

  it("never returns 'default' (default has non-hex values)", () => {
    const r = nearestColorName("#000000", "text")
    expect(r).not.toBe("default")
  })

  // Perceptual (L*a*b*) matching, not raw RGB L2: a light, slightly red-leaning
  // blue must stay blue and not straddle into purple just because the palette
  // blue is darker. Regression for the re-measured palette (b8f85d8).
  it("maps a light red-leaning blue to blue, not purple", () => {
    expect(nearestColorName("#83abe1", "text")).toBe("blue")
  })

  // Same hue, different value: brown is a dark/desaturated orange. Lightness
  // (L*) must keep them apart.
  it("separates brown from orange by lightness", () => {
    expect(nearestColorName(COLORS.brown.fg, "text")).toBe("brown")
    expect(nearestColorName(COLORS.orange.fg, "text")).toBe("orange")
  })
})

describe("nearestColorName is theme-invariant", () => {
  // Notion uses the same fg in light and dark, so this is the easy case.
  // Pin it explicitly anyway.
  it.each([
    ["rgb(198, 127, 63)", "orange"],
    ["rgb(74, 124, 195)", "blue"],
    ["rgb(125, 122, 118)", "gray"],
  ])("text variant: %s → %s", (input, expected) => {
    expect(nearestColorName(input, "text")).toBe(expected)
  })

  // Bg variant: confirm Notion dark bg maps to the right name.
  it.each([
    ["rgb(79, 55, 35)", "orange"],
    ["rgb(40, 56, 78)", "blue"],
    ["rgb(56, 56, 54)", "gray"],
  ])("background variant: %s → %s", (input, expected) => {
    expect(nearestColorName(input, "background")).toBe(expected)
  })

  // Falsification: variant must route to the correct reference set.
  // Notion dark orange bg rgb(79,55,35) is closer in RGB-L2 to brown-fg
  // than orange-fg, so a fg-only-reference refactor would silently red
  // this case.
  it("background variant uses bg reference, not fg", () => {
    expect(nearestColorName("rgb(79, 55, 35)", "background")).toBe("orange")
    expect(nearestColorName("rgb(79, 55, 35)", "text")).not.toBe("orange")
  })
})
