// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ColorIndicator — small swatch chip rendered inside a swatch button.
// "text" variant shows the letter "A" tinted with the named color; the
// chip background is transparent unless `bgName` overrides. "background"
// variant shows a filled square. Idle/active state drives a derived
// box-shadow ring via CSS color-mix on the fg token. All visuals come
// from data-attribute selectors in color-palette.css — no inline hex.
import { cn } from "../lib/utils"
import type { ColorName } from "@ocai/rune-core"

export interface ColorIndicatorProps {
  /** Primary color: text variant tints the "A" glyph; background variant
   *  fills the chip background. */
  name: ColorName
  variant: "text" | "background"
  /** Optional secondary color: forces the chip background. Used by the
   *  InlineToolbar to render the active text color ON the active bg
   *  color in a single chip. */
  bgName?: ColorName
  active?: boolean
  size?: "sm" | "md"
  className?: string
}

export function ColorIndicator({
  name,
  variant,
  bgName,
  active,
  size = "md",
  className,
}: ColorIndicatorProps) {
  return (
    <span
      data-color-indicator={name}
      data-indicator-variant={variant}
      data-indicator-bg={bgName}
      data-indicator-active={active ? "" : undefined}
      className={cn(
        // rounded-sm = --radius * 0.6 = 6px (matches the reference swatch chip
        // and tracks --radius reskins). text-xs is the default glyph size,
        // overridden to text-base on the 26px menu chips.
        "inline-flex items-center justify-center rounded-sm text-xs font-medium transition-shadow duration-150",
        size === "sm" ? "size-4" : "size-6.5",
        className,
      )}
    >
      {variant === "text" ? "A" : ""}
    </span>
  )
}
