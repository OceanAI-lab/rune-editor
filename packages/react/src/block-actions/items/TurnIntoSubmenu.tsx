// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// TurnIntoSubmenu — the "Turn into" row in the side-menu block-actions
// dropdown. Trigger keeps native-menu styling (compact, sibling of the
// other actions). The submenu panel hosts TurnIntoBody — the same shared
// body the inline toolbar's Turn-into popover renders — so block-type
// items only exist in one place and adding a new block lights up here
// automatically.
//
// captureKeyboard is false because the parent BlockActionsDropdown owns
// keyboard navigation; we don't want competing document-level handlers.
// Click-to-commit still works (mouse path doesn't depend on it).

import type { Editor } from "@tiptap/core"
import { Popover, PopoverAnchor, PopoverContent } from "../../components/ui/popover"
import { ChevronRightIcon, RepeatIcon } from "../../icons"
import { cn } from "../../lib/utils"
import { nativeMenuItemClass, useNativeMenuSubmenu } from "../../native-menu"
import { TurnIntoBody, useTurnIntoTargets } from "../../turn-into"

const SUBTRIGGER_ATTR = "data-rune-turn-into-subtrigger"
export const TURN_INTO_SUBMENU_ATTR = "data-rune-turn-into-submenu"

export interface TurnIntoSubmenuProps {
  editor: Editor
  sourceBlockIds: string[]
  onAfterApply?: () => void
}

export function TurnIntoSubmenu({
  editor,
  sourceBlockIds,
  onAfterApply,
}: TurnIntoSubmenuProps) {
  const submenu = useNativeMenuSubmenu()
  // Cheap pre-check: don't render the trigger row at all when there are
  // no convertible targets (e.g. the source is a table). TurnIntoBody runs
  // the same hook inside; both share React's render-tree memoization.
  const { groups } = useTurnIntoTargets(editor, sourceBlockIds)

  if (groups.length === 0) return null

  return (
    <Popover open={submenu.isOpen} onOpenChange={() => {}}>
      <PopoverAnchor asChild>
        <div
          {...{ [SUBTRIGGER_ATTR]: "" }}
          className={cn(
            nativeMenuItemClass("default"),
            submenu.isOpen && "bg-accent text-accent-foreground",
          )}
          {...submenu.triggerProps}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={submenu.isOpen}
        >
          <RepeatIcon />
          <span>Turn into</span>
          <ChevronRightIcon className="ml-auto" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        {...{ [TURN_INTO_SUBMENU_ATTR]: "" }}
        // overflow-hidden so the scroller's mask + rounded corners clip
        // cleanly against the outer chrome — same layering as
        // SuggestionMenuPopover. w-64 matches the inline-toolbar's
        // Turn-into popover so both surfaces feel like the same menu.
        className="w-64 max-w-[calc(100vw-24px)] overflow-hidden gap-0 p-0 text-inherit"
        {...submenu.contentProps}
      >
        <TurnIntoBody
          editor={editor}
          sourceBlockIds={sourceBlockIds}
          onAfterApply={() => {
            submenu.close()
            onAfterApply?.()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
