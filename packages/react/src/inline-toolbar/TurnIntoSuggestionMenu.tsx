// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// TurnIntoSuggestionMenu — opened from the inline toolbar's (1,1) TextIcon
// button. Pure positioning chrome around the shared TurnIntoBody:
//
//   * Anchor is the button's getBoundingClientRect (not a PM coords
//     virtualRef like the slash menu).
//   * SuggestionMenuPopover supplies the Radix Popover + Close footer.
//   * TurnIntoBody owns data / commit / keyboard / item rendering — the
//     same body the side-menu's Turn-into submenu mounts, so adding a new
//     block type lights up in BOTH surfaces with no extra wiring.
//
// captureKeyboard=true because PM holds focus while the inline toolbar is
// open — arrow / Enter / Esc must intercept at the document level (capture
// phase) before PM's view handlers see them.

import { useCallback, type RefObject } from "react"
import type { Editor } from "@tiptap/core"
import { SuggestionMenuPopover } from "../suggestion-menu"
import { TurnIntoBody } from "../turn-into"

export interface TurnIntoSuggestionMenuProps {
  editor: Editor
  sourceBlockId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: RefObject<HTMLElement | null>
}

export function TurnIntoSuggestionMenu({
  editor,
  sourceBlockId,
  open,
  onOpenChange,
  anchorRef,
}: TurnIntoSuggestionMenuProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const getAnchorRect = useCallback(
    () => anchorRef.current?.getBoundingClientRect() ?? null,
    [anchorRef],
  )

  // Outside-click on the anchor button is a no-op so the trigger's own
  // click owns the open/close toggle. Otherwise the dismissable layer
  // would close the popover on the same pointerdown that the button
  // then toggles back open — net effect: clicking the open trigger keeps
  // it open instead of closing it.
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
      // Anchor is the toolbar button (body-portaled, not inside the editor), so
      // contextElement is the button itself: floating-ui's observeMove then
      // re-positions this menu whenever the toolbar moves it on inner-container
      // scroll, not just window. editor.view.dom would be wrong here.
      contextElement={anchorRef.current}
      popover={{
        // Open to the SIDE of the toolbar (Notion-style), not below. Radix
        // flips right → left via avoidCollisions when the right gutter is
        // too narrow, and useLockedPopoverSide (inside SuggestionMenuPopover)
        // pins the resolved side so it can't re-flip mid-interaction.
        side: "right",
        align: "start",
        sideOffset: 6,
        // Narrower than the default slash-menu popover (w-81 / 324px) and
        // matched to the block-actions Turn-into submenu so both Turn-into
        // surfaces render at the same width — see TurnIntoSubmenu.tsx.
        className: "w-64",
      }}
      onEscapeKeyDown={close}
      onPointerDownOutside={handlePointerDownOutside}
      onClose={close}
    >
      <TurnIntoBody
        editor={editor}
        sourceBlockIds={[sourceBlockId]}
        onAfterApply={close}
        onClose={close}
        captureKeyboard
      />
    </SuggestionMenuPopover>
  )
}
