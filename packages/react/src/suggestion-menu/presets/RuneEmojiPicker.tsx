// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useCallback } from "react"
import type { Editor } from "@tiptap/core"
import { getSuggestionMenus } from "@ocai/rune-core"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useStableVirtualElement } from "@/components/ui/useStableVirtualElement"
import { editorViewDom } from "@/positioning"
import { useSuggestionMenuState } from "../hooks/useSuggestionMenuState"
import {
  EmojiPicker,
  type EmojiPickerProps,
  type EmojiPickerSelection,
} from "@/emoji-picker/EmojiPicker"

const TRIGGER = ":"

/**
 * Adapter that wires the generic {@link EmojiPicker} into the editor's
 * `:` suggestion trigger.
 *
 * The picker is driven entirely by the `:` trigger's state — the live
 * `query` (text typed after `:`) feeds the picker's `search` prop so
 * filtering happens as the user keeps typing into the editor, and the
 * popover never steals focus from the caret.
 *
 * Slash-menu Emoji is plumbed through the same trigger: selecting it
 * runs `spawnEmojiTrigger`, which replaces the typed `/query` with `:`
 * and force-opens the trigger at the inserted position. From the
 * picker's point of view there is exactly one open path.
 */
export interface RuneEmojiPickerProps {
  editor: Editor | null
  /**
   * Optional self-host base URL for Emojibase data, forwarded to the
   * underlying {@link EmojiPicker}. Useful when the host environment can't
   * reach the default jsdelivr CDN (e.g. Electron renderer with strict
   * `connect-src 'self'`).
   */
  emojibaseUrl?: string
  /**
   * Custom render for the failure state when Emojibase data can't be
   * fetched. Forwarded to the underlying {@link EmojiPicker}.
   */
  renderError?: EmojiPickerProps["renderError"]
}

export function RuneEmojiPicker({
  editor,
  emojibaseUrl,
  renderError,
}: RuneEmojiPickerProps) {
  const state = useSuggestionMenuState(editor, TRIGGER)
  // contextElement = editor DOM so the menu re-positions on inner-container
  // scroll (the caret clientRect lives inside the editor), not just window.
  const virtualRef = useStableVirtualElement(
    state?.getClientRect ?? null,
    editorViewDom(editor),
  )

  const close = useCallback(() => {
    if (!editor) return
    const snap = getSuggestionMenus(editor).triggers[TRIGGER]?.getSnapshot()
    if (!snap?.range) return
    // Deleting the `:` token ends the suggestion session, which fires
    // the plugin's onExit and clears any force-open bypass.
    editor.chain().focus().deleteRange(snap.range).run()
  }, [editor])

  const commit = useCallback(
    (selection: EmojiPickerSelection) => {
      if (!editor) return
      const snap = getSuggestionMenus(editor).triggers[TRIGGER]?.getSnapshot()
      if (!snap?.range) return
      editor.chain().focus().deleteRange(snap.range).insertContent(selection.emoji).run()
    },
    [editor],
  )

  if (!virtualRef || !editor) return null

  return (
    <Popover open={state?.show ?? false} onOpenChange={() => {}}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        // Keep focus in the editor so the user can keep typing the
        // `:query` — the picker filters live via the `search` prop
        // without ever stealing the caret.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          // The editor never lost focus (onOpenAutoFocus prevented it),
          // but re-assert it on close in case a click inside the popover
          // moved focus to the emoji button. Guard isDestroyed: Radix fires
          // onCloseAutoFocus on unmount, which can run after the editor has
          // already been torn down (commands getter throws on a dead editor).
          e.preventDefault()
          if (!editor.isDestroyed) editor.commands.focus()
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          close()
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault()
          close()
        }}
        // Strip shadcn's default chrome (padding / flex / w-72 / text-sm)
        // so the EmojiPicker's own layout takes over.
        className="rune-emoji-popover rune-muted-scrollbar w-auto p-0 gap-0 rounded-lg overflow-hidden text-inherit"
      >
        <EmojiPicker
          onSelect={commit}
          search={state?.query ?? ""}
          emojibaseUrl={emojibaseUrl}
          renderError={renderError}
        />
      </PopoverContent>
    </Popover>
  )
}
