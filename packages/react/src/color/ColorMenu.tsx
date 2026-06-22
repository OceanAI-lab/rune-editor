// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ColorMenu — swatch grid for picking text and background colors.
// Two 5×2 grids (Text color / Background color), each cell wraps a
// ColorIndicator in a button so the click target extends past the
// indicator chip. Pure presentation — callers wire onApply* to the
// editor commands. Used by M4a's BlockActionsDropdown (block-level)
// and the upcoming M4b inline text toolbar.
//
// Optional "Recently used" row (top): a single mixed line of the most-recent
// text/background picks. Presentation-only — the caller owns the recents store
// (see recentColors.ts) and passes the resolved list; each entry carries its
// `kind` so a click re-applies it to the right surface.
import type { ReactNode } from "react"
import { COLORS, COLOR_NAMES, type ColorName } from "@ocai/rune-core"
import { Button } from "../components/ui/button"
import { NativeMenuLabel } from "../native-menu"
import { ColorIndicator } from "./ColorIndicator"
import type { RecentColor } from "./recentColors"

export interface ColorMenuProps {
  activeText?: ColorName | null
  activeBg?: ColorName | null
  onApplyText?: (name: ColorName) => void
  onApplyBackground?: (name: ColorName) => void
  /** Most-recent picks, newest first. Renders a "Recently used" row at the top
   *  when non-empty; omit (or pass []) to hide it. */
  recent?: RecentColor[]
}

export function ColorMenu({
  activeText,
  activeBg,
  onApplyText,
  onApplyBackground,
  recent,
}: ColorMenuProps) {
  return (
    // Sections share an airier vertical rhythm matched to the reference color
    // menu: text-only label + 8px to its grid (SectionLabel's mb-2), 14px
    // between sections (space-y-3.5). px-1 keeps the popover at 190px.
    <div className="rune-color-menu px-1 py-2 select-none">
      <div className="space-y-3.5">
        {recent && recent.length > 0 && (
          <div>
            <SectionLabel>Recently used</SectionLabel>
            <RecentRow
              recent={recent}
              activeText={activeText ?? "default"}
              activeBg={activeBg ?? "default"}
              onApplyText={onApplyText}
              onApplyBackground={onApplyBackground}
            />
          </div>
        )}
        {onApplyText && (
          <div>
            <SectionLabel>Text color</SectionLabel>
            <SwatchGrid
              variant="text"
              active={activeText ?? "default"}
              onPick={onApplyText}
            />
          </div>
        )}
        {onApplyBackground && (
          <div>
            <SectionLabel>Background color</SectionLabel>
            <SwatchGrid
              variant="background"
              active={activeBg ?? "default"}
              onPick={onApplyBackground}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Section label — text-only (kills NativeMenuLabel's py-1) with an 8px gap to
// its grid; sections are spaced 14px apart by the parent's space-y-3.5.
function SectionLabel({ children }: { children: ReactNode }) {
  return <NativeMenuLabel className="px-2 py-0 mb-2">{children}</NativeMenuLabel>
}

// Recently-used row — a single mixed line of text/background swatches.
// Swatches are tagged `data-recent-kind` (NOT `data-swatch-kind`, which is
// reserved for the canonical grids below) so existing grid-scoped selectors
// stay unambiguous. Clicking re-applies via the matching onApply* by kind.
interface RecentRowProps {
  recent: RecentColor[]
  activeText: ColorName
  activeBg: ColorName
  onApplyText?: (name: ColorName) => void
  onApplyBackground?: (name: ColorName) => void
}

function RecentRow({
  recent,
  activeText,
  activeBg,
  onApplyText,
  onApplyBackground,
}: RecentRowProps) {
  return (
    <div data-swatch-grid="recent" className="grid grid-cols-5 gap-1 px-2">
      {recent.map(({ name, kind }) => {
        const entry = COLORS[name]
        const onApply = kind === "text" ? onApplyText : onApplyBackground
        const active = kind === "text" ? activeText === name : activeBg === name
        return (
          <Button
            key={`recent-${kind}-${name}`}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${entry.label} ${kind === "text" ? "text" : "background"}`}
            title={entry.label}
            data-color={name}
            data-recent-kind={kind}
            disabled={!onApply}
            onMouseDown={(e) => {
              // Keep PM focus; the click would otherwise blur the editor.
              e.preventDefault()
              onApply?.(name)
            }}
            className="size-7.5 rounded-lg hover:bg-transparent"
          >
            <ColorIndicator
              name={name}
              variant={kind}
              active={active}
              className="text-base"
            />
          </Button>
        )
      })}
    </div>
  )
}

interface SwatchGridProps {
  variant: "text" | "background"
  active: ColorName
  onPick: (name: ColorName) => void
}

function SwatchGrid({ variant, active, onPick }: SwatchGridProps) {
  return (
    <div data-swatch-grid={variant} className="grid grid-cols-5 gap-1 px-2">
      {COLOR_NAMES.map((name) => {
        const entry = COLORS[name]
        return (
          <Button
            key={`${variant}-${name}`}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={entry.label}
            title={entry.label}
            data-color={name}
            data-swatch-kind={variant}
            onMouseDown={(e) => {
              // Keep PM focus by blocking the button's default focus
              // shift; the click would otherwise blur the editor.
              e.preventDefault()
              onPick(name)
            }}
            className="size-7.5 rounded-lg hover:bg-transparent"
          >
            <ColorIndicator
              name={name}
              variant={variant}
              active={active === name}
              className="text-base"
            />
          </Button>
        )
      })}
    </div>
  )
}
