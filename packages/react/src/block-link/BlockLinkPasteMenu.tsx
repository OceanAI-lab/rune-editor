// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { Popover, PopoverAnchor, PopoverContent } from "../components/ui/popover"
import { useStableVirtualElement } from "../components/ui/useStableVirtualElement"
import { useRangeAnchor } from "../positioning"
import { cn } from "@/lib/utils"
import {
  NativeMenuItem,
  NativeMenuLabel,
  nativeMenuContentClass,
} from "../native-menu"
import type { RuneBlockLinkTarget } from "./types"

export interface BlockLinkPasteState {
  href: string
  target: RuneBlockLinkTarget
  range: { from: number; to: number }
  pending: boolean
  error: boolean
}

export interface BlockLinkPasteMenuProps {
  editor: Editor
  state: BlockLinkPasteState | null
  onMention: () => void
  onUrl: () => void
  onClose: () => void
}

export function BlockLinkPasteMenu({
  editor,
  state,
  onMention,
  onUrl,
  onClose,
}: BlockLinkPasteMenuProps) {
  // Live anchor over the pasted link's range — contextElement lets floating-ui
  // re-position on inner-container scroll, unlike the old captured rect.
  const linkAnchor = useRangeAnchor(editor, state?.range ?? null)
  const virtualRef = useStableVirtualElement(linkAnchor)
  if (!state || !virtualRef) return null

  const mentionDisabled = state.pending || state.error

  return (
    <Popover open modal={false} onOpenChange={(next) => { if (!next) onClose() }}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        role="menu"
        align="start"
        side="bottom"
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !mentionDisabled) {
            event.preventDefault()
            onMention()
          }
        }}
        className={cn("gap-0",nativeMenuContentClass("popover"))}
        data-rune-block-link-paste-menu=""
      >
        <NativeMenuLabel>Paste as</NativeMenuLabel>
        <NativeMenuItem
          aria-disabled={mentionDisabled || undefined}
          className={mentionDisabled ? "pointer-events-none opacity-50" : undefined}
          onClick={() => {
            if (!mentionDisabled) onMention()
          }}
        >
          Mention
        </NativeMenuItem>
        {state.error && (
          <div className="px-1.5 pb-1 text-xs text-muted-foreground">
            Unavailable block
          </div>
        )}
        <NativeMenuItem onClick={onUrl}>URL</NativeMenuItem>
      </PopoverContent>
    </Popover>
  )
}
