// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export const COLOR_NAMES = [
  "default","gray","brown","orange","yellow","green","blue","purple","pink","red",
] as const
export type ColorName = (typeof COLOR_NAMES)[number]

export type NamedColorEntry = {
  label: string
  /** Matching reference values, NOT render values. Used by nearestColorName
   *  at paste time to map an arbitrary CSS color back to a palette name.
   *  Rendered colors in light/dark live in color-palette.css; these stay
   *  theme-invariant so paste semantics are stable across modes.
   *
   *  fg = canonical fg per Notion (same in light + dark — verified 2026-04-27).
   *  bg = canonical dark bg per Notion. Light-mode bg pastes have lower
   *       precision (light bg = ~14% fg + 86% white; closest fg-channel
   *       proximity wins). */
  fg: string
  bg: string
}

export const COLORS: Record<ColorName, NamedColorEntry> = {
  default: { label: "Default", fg: "inherit",            bg: "transparent" },
  gray:    { label: "Gray",    fg: "rgb(125, 122, 118)", bg: "rgb(56, 56, 54)" },
  brown:   { label: "Brown",   fg: "rgb(152, 120, 94)",  bg: "rgb(67, 55, 46)" },
  orange:  { label: "Orange",  fg: "rgb(198, 127, 63)",  bg: "rgb(79, 55, 35)" },
  yellow:  { label: "Yellow",  fg: "rgb(195, 150, 71)",  bg: "rgb(78, 69, 41)" },
  green:   { label: "Green",   fg: "rgb(97, 147, 113)",  bg: "rgb(43, 61, 49)" },
  blue:    { label: "Blue",    fg: "rgb(74, 124, 195)",  bg: "rgb(40, 56, 78)" },
  purple:  { label: "Purple",  fg: "rgb(147, 109, 176)", bg: "rgb(58, 46, 70)" },
  pink:    { label: "Pink",    fg: "rgb(179, 84, 136)",  bg: "rgb(73, 45, 60)" },
  red:     { label: "Red",     fg: "rgb(192, 89, 78)",   bg: "rgb(75, 46, 42)" },
}
