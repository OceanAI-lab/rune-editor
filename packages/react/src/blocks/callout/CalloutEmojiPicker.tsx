// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/core"
import { getCalloutEmojiPopoverBlockId } from "@ocai/rune-core"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "../../components/ui/popover"
import { Input } from "../../components/ui/input"
import { useStableVirtualElement } from "../../components/ui/useStableVirtualElement"
import { editorViewDom } from "../../positioning"
import { useRuneEditorState } from "../../useRuneEditorState"
import { EmojiPicker, type EmojiPickerSelection } from "../../emoji-picker/EmojiPicker"

export interface CalloutEmojiPickerProps {
  editor: Editor
  /**
   * Base URL for the Emojibase JSON data, forwarded to {@link EmojiPicker}.
   * Point this at a self-hosted copy when the host can't reach the default
   * jsdelivr CDN (e.g. a strict `connect-src 'self'` CSP).
   */
  emojibaseUrl?: string
}

interface ActiveCalloutIcon {
  blockId: string
  element: HTMLElement
}

interface CalloutEmojiSnapshot {
  active: ActiveCalloutIcon | null
  editable: boolean
}

/**
 * Resolve the live `.rune-callout-icon` element for the callout whose icon was
 * clicked (the plugin tracks the id; we find the current DOM node, which may
 * have been re-rendered). The popover anchors to this element.
 */
function activeCalloutIcon(editor: Editor): ActiveCalloutIcon | null {
  const blockId = getCalloutEmojiPopoverBlockId(editor)
  if (!blockId) return null
  const block = editor.view.dom.querySelector<HTMLElement>(
    `.rune-block.rune-callout[data-id="${CSS.escape(blockId)}"]`,
  )
  const element = block?.querySelector<HTMLElement>(".rune-callout-icon") ?? null
  if (!element) return null
  return { blockId, element }
}

function sameSnapshot(a: CalloutEmojiSnapshot, b: CalloutEmojiSnapshot): boolean {
  if (a.editable !== b.editable) return false
  if (a.active === null || b.active === null) return a.active === b.active
  return (
    a.active.blockId === b.active.blockId && a.active.element === b.active.element
  )
}

/**
 * Click a callout's emoji → a popover opens with the searchable emoji picker;
 * selecting one writes the `icon` attr (content-safe, via `setCalloutIcon`)
 * and refocuses the editor. Mount once, as a sibling of the other editor
 * chrome in {@link RuneEditor}.
 */
export function CalloutEmojiPicker({
  editor,
  emojibaseUrl,
}: CalloutEmojiPickerProps) {
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState("")

  const { active, editable } = useRuneEditorState(
    editor,
    (current) => ({
      active: activeCalloutIcon(current),
      editable: current.isEditable,
    }),
    { isEqual: sameSnapshot },
  )

  const getRect = useCallback(
    () => active?.element.getBoundingClientRect() ?? null,
    [active],
  )
  // contextElement = editor DOM so the popover re-positions on inner-container
  // scroll (the icon lives inside the editor), not just on window scroll.
  const virtualRef = useStableVirtualElement(
    active ? getRect : null,
    editorViewDom(editor),
  )

  // Reset the search query each time a different callout's picker opens.
  useEffect(() => {
    setSearch("")
  }, [active?.blockId])

  useEffect(() => {
    if (active && !editable) editor.commands.closeCalloutEmojiPopover()
  }, [active, editable, editor])

  const onSelect = useCallback(
    (selection: EmojiPickerSelection) => {
      const blockId = active?.blockId
      if (!blockId) return
      editor.commands.setCalloutIcon(blockId, selection.emoji)
      editor.commands.closeCalloutEmojiPopover()
      editor.commands.focus()
    },
    [active, editor],
  )

  if (!active || !virtualRef || !editable) return null

  return (
    <Popover open modal={false} onOpenChange={() => {}}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        // Keep the editor selection intact; focus the search input instead of
        // Radix's default first-focusable so typing filters immediately.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          editor.commands.closeCalloutEmojiPopover()
          editor.commands.focus()
        }}
        onPointerDownOutside={(event) => {
          // A pointer-down on the active icon is the same gesture that will
          // re-fire the icon's open handler; closing here would make the
          // picker flicker (close → immediate reopen). Let that gesture be a
          // no-op instead — every other outside target dismisses.
          const target = event.detail.originalEvent.target
          if (target instanceof Node && active?.element.contains(target)) {
            event.preventDefault()
            return
          }
          editor.commands.closeCalloutEmojiPopover()
        }}
        onFocusOutside={(event) => event.preventDefault()}
        // Don't let the picker's keystrokes / clicks reach the editor.
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="rune-muted-scrollbar w-auto overflow-hidden p-0"
        data-rune-callout-emoji-popover=""
      >
        <div className="flex flex-col">
          <div className="p-2">
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search emoji"
              aria-label="Search emoji"
              className="h-8"
            />
          </div>
          <EmojiPicker
            search={search}
            onSelect={onSelect}
            emojibaseUrl={emojibaseUrl}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
