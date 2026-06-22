// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useStableVirtualElement } from "@/components/ui/useStableVirtualElement"
import { useLockedPopoverSide } from "@/components/ui/useLockedPopoverSide"
import { cn } from "../lib/utils"
import type { SuggestionMenuPopoverComponentProps } from "./types"

export function SuggestionMenuPopover({
  open,
  getClientRect,
  contextElement,
  popover,
  children,
  onEscapeKeyDown,
  onPointerDownOutside,
  onClose,
  showCloseFooter = true,
}: SuggestionMenuPopoverComponentProps) {
  const virtualRef = useStableVirtualElement(getClientRect, contextElement)

  // Pin the resolved side after the first open so filter-driven height
  // changes don't make Radix flip the popover. Without this, the menu
  // can open upward (because the unfiltered list won't fit below),
  // then flip downward after the user types and the filtered list
  // shrinks — disorienting (the menu visually leaps over the caret).
  // Same lock shared by LinkHoverCard / future hover popovers; see
  // useLockedPopoverSide JSDoc.
  const { contentRef, lockedSide, avoidCollisions } = useLockedPopoverSide(open)

  // Bail out only before the first-ever open — once we've had a rect we
  // stay mounted so Radix owns open→closed transitions and animation.
  if (!virtualRef) return null

  return (
    // onOpenChange is a no-op by design: close paths flow through our
    // store (store → open prop → Radix state transition → animation).
    // The stub must still be present — without it, Radix's DismissableLayer
    // dismiss fallback path (triggered after onPointerDownOutside when the
    // event isn't preventDefault'd) skips the data-state transition and
    // hard-unmounts Content, killing the exit animation on click-outside.
    <Popover open={open} onOpenChange={() => {}}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        ref={contentRef}
        side={lockedSide ?? popover?.side ?? "bottom"}
        align={popover?.align ?? "start"}
        sideOffset={popover?.sideOffset ?? 4}
        collisionPadding={popover?.collisionPadding ?? 8}
        avoidCollisions={avoidCollisions}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          onEscapeKeyDown?.(e)
        }}
        onPointerDownOutside={(e) => {
          // Forward the original target so callers can skip closing when
          // the click is on the popover's anchor/trigger button. Without
          // this, clicking the trigger again would close here AND reopen
          // via the trigger's own click handler — net effect: stays open.
          const target = (e.detail.originalEvent as PointerEvent | undefined)?.target ?? null
          onPointerDownOutside?.(target)
        }}
        // shadcn PopoverContent is tuned for form popovers (w-72,
        // flex-col + gap + padding, text-sm). Override for a list menu.
        // tailwind-merge (via cn() in PopoverContent) resolves conflicts
        // last-wins; data-open/data-closed animation classes survive.
        //
        // Layering: PopoverContent owns the chrome (rounded/ring/shadow)
        // with overflow-hidden so the rounded corners clip the scroller
        // inside. The scroller (max-h + overflow-y-auto + mask) lives
        // inside `children` (DefaultSuggestionMenu owns it) — putting
        // mask on PopoverContent itself would clip the ring/shadow and
        // the top edge, which we hit before.
        className={cn(
          "rune-suggestion-popover block w-81 min-w-45 max-w-[calc(100vw-24px)] overflow-hidden gap-0 p-0 text-inherit",
          popover?.className,
        )}
      >
        {children}
        {showCloseFooter ? (
          // Footer sits outside the scroller so it stays pinned to the
          // bottom and isn't faded by the mask. Hairline top border
          // separates it from the list. onMouseDown handles the close —
          // using onClick would lose the editor focus race against the
          // pointerdown-outside path (Radix may dispatch the dismiss
          // before React clicks fire).
          <>
            <hr />
            <div className="p-1">
              <Button
                type="button"
                variant="ghost"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onClose?.()
                }}
                className="w-full cursor-pointer justify-start font-normal"
              >
                <span>Close menu</span>
                <span className="ml-auto text-muted-foreground/60">
                  esc
                </span>
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
