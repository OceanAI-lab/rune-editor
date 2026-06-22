// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// InlineColorMenu — opened from the inline toolbar's Color (1,1) swatch
// button. Pure positioning chrome around the shared ColorMenu, mirroring
// TurnIntoSuggestionMenu:
//
//   * Anchor is the formatting-area wrapper's getBoundingClientRect, so the
//     palette drops down BELOW the buttons (side="bottom", left-aligned),
//     reproducing the original `top-full left-0` placement — and tracks the
//     toolbar on inner-container scroll.
//   * SuggestionMenuPopover supplies the Radix Popover (portaled to body),
//     collision-aware side flip (bottom → top near the viewport edge), and
//     the side lock so it can't re-flip mid-interaction.
//
// Why a portaled sibling popover, not an `absolute top-full` child: the old
// embedded div lived inside the toolbar's `overflow-hidden` PopoverContent
// and had no viewport awareness, so its layout depended on the toolbar's
// transient box. A window-blur / display-switch reflow (the toolbar survives
// those by design — see #72) could leave it laid out *inside* the panel
// instead of hanging off it. A body-portaled, anchored popover is immune.

import { useCallback, type RefObject } from "react"
import { type ColorName } from "@ocai/rune-core"
import { SuggestionMenuPopover } from "../suggestion-menu"
import { ColorMenu, type RecentColor } from "../color"

// E2E + active-state selector. Kept identical to the prior embedded markup so
// existing specs (inline-color-*.spec.ts) resolve the swatch grids unchanged.
const COLOR_MENU_ATTR = "data-rune-inline-toolbar-color-menu"

export interface InlineColorMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: RefObject<HTMLElement | null>
  activeText: ColorName | null
  activeBg: ColorName | null
  onApplyText: (name: ColorName) => void
  onApplyBackground: (name: ColorName) => void
  recent: RecentColor[]
}

export function InlineColorMenu({
  open,
  onOpenChange,
  anchorRef,
  activeText,
  activeBg,
  onApplyText,
  onApplyBackground,
  recent,
}: InlineColorMenuProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const getAnchorRect = useCallback(
    () => anchorRef.current?.getBoundingClientRect() ?? null,
    [anchorRef],
  )

  // Outside-click anywhere within the formatting area (the anchor) is a no-op:
  // the Color trigger's own mousedown toggles closed, and every other button
  // there already sets colorOpen=false. Without this, the dismissable layer
  // would close on the same pointerdown the trigger then toggles back open.
  // Clicks elsewhere (incl. the AI section) fall through to close(). Mirrors
  // TurnIntoSuggestionMenu (whose anchor is its trigger button).
  const handlePointerDownOutside = useCallback(
    (target: EventTarget | null) => {
      if (target instanceof Node && anchorRef.current?.contains(target)) return
      close()
    },
    [close, anchorRef],
  )

  return (
    <SuggestionMenuPopover
      open={open}
      getClientRect={getAnchorRect}
      // Anchor lives inside the body-portaled toolbar (not the editor), so
      // contextElement is the anchor element itself: floating-ui's observeMove
      // then re-positions this menu whenever the toolbar moves on inner-
      // container scroll, not just window.
      contextElement={anchorRef.current}
      popover={{
        // Dropdown BELOW the formatting area (Notion-style), left-aligned.
        // Radix flips bottom → top via avoidCollisions near the viewport
        // bottom, and useLockedPopoverSide (inside SuggestionMenuPopover)
        // pins the resolved side so it can't re-flip mid-interaction.
        side: "bottom",
        align: "start",
        sideOffset: 2,
        // Size to the swatch grid; the suggestion-menu default (w-81) is
        // far too wide for a 5-col palette.
        className: "w-max min-w-0",
      }}
      onEscapeKeyDown={close}
      onPointerDownOutside={handlePointerDownOutside}
      onClose={close}
      // No "Close menu" footer — a palette is a one-click action, not a list.
      showCloseFooter={false}
    >
      <div {...{ [COLOR_MENU_ATTR]: "" }}>
        <ColorMenu
          activeText={activeText}
          activeBg={activeBg}
          onApplyText={onApplyText}
          onApplyBackground={onApplyBackground}
          recent={recent}
        />
      </div>
    </SuggestionMenuPopover>
  )
}
