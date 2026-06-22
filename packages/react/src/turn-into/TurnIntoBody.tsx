// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// TurnIntoBody — the shared "list of convertible block types" body used by
// both the inline toolbar's Turn-into popover and the side-menu's
// Turn-into submenu. Owns:
//
//   * data        — useTurnIntoTargets (filtered + active-marked items)
//   * enrichment  — pulls icon/size from getDefaultReactSlashMenuItems so
//                   adding a new block lights up here automatically
//   * highlight   — single selectedIndex driven by keyboard AND mouse hover
//   * commit      — editor.commands.turnInto + onAfterApply + view.focus
//   * keyboard    — opt-in document-level capture (toolbar uses it because
//                   PM holds focus; side menu doesn't because the parent
//                   dropdown manages keyboard nav itself)
//
// Does NOT own outer chrome / positioning — wrap it in whatever popover
// or submenu div the surface uses.

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Editor } from "@tiptap/core"
import {
  DefaultSuggestionMenu,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "../suggestion-menu"
import { handleSuggestionNavKey } from "../suggestion-menu/hooks/useSuggestionMenuKeyboard"
import { useTurnIntoTargets } from "./useTurnIntoTargets"

export interface TurnIntoBodyProps {
  editor: Editor
  /** One or more block ids to convert. Multi-select is supported — when
   *  more than one is passed the active-row check is suppressed (different
   *  blocks may have different current types). */
  sourceBlockIds: string[]
  /** Fired after a successful turnInto commit. Surfaces use this to close
   *  their own chrome (popover / submenu) — TurnIntoBody never closes
   *  itself; it has no concept of its container. */
  onAfterApply?: () => void
  /** Fired on Escape when `captureKeyboard` is true. Ignored otherwise
   *  (the surface owns Escape). */
  onClose?: () => void
  /** When true, install a document-level capture-phase keydown listener
   *  for arrow / enter / tab / escape navigation. Use this when the host
   *  surface (e.g. the inline toolbar) leaves PM focused — PM would
   *  otherwise eat the arrow keys for caret movement.
   *
   *  When false (default), the parent menu's own keyboard handling drives
   *  navigation. Selecting an item by click still works because the
   *  click → commit path doesn't depend on keyboard state. */
  captureKeyboard?: boolean
}

export function TurnIntoBody({
  editor,
  sourceBlockIds,
  onAfterApply,
  onClose,
  captureKeyboard = false,
}: TurnIntoBodyProps) {
  const { groups } = useTurnIntoTargets(editor, sourceBlockIds)
  const reactItems = useMemo(
    () => getDefaultReactSlashMenuItems(editor),
    [editor],
  )
  const reactItemsByKey = useMemo(
    () => new Map(reactItems.map((item) => [item.key, item])),
    [reactItems],
  )

  // Flatten groups → DefaultReactSuggestionItem[] with icon/size pulled from
  // the React-side enrichment of slash items. `active` and `group` come
  // from the Turn-into resolution; `shortcut` is dropped (the `#`/`>`
  // glyphs belong to the slash surface). DefaultSuggestionMenu re-groups
  // by item.group internally, so the order of this flattened array
  // defines section order on screen.
  const items = useMemo<DefaultReactSuggestionItem[]>(() => {
    return groups.flatMap((g) =>
      g.items.map((target) => {
        const reactItem = reactItemsByKey.get(target.key)
        return {
          ...target.item,
          icon: reactItem?.icon,
          size: reactItem?.size,
          shortcut: undefined,
          active: target.active,
          group: target.group,
        }
      }),
    )
  }, [groups, reactItemsByKey])

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [revealSelectedItem, setRevealSelectedItem] = useState(false)
  useEffect(() => {
    setSelectedIndex(0)
    setRevealSelectedItem(false)
  }, [items.length])

  const setKeyboardSelectedIndex = useCallback((idx: number) => {
    setRevealSelectedItem(true)
    setSelectedIndex(idx)
  }, [])

  const handleItemHover = useCallback((idx: number) => {
    setRevealSelectedItem(false)
    setSelectedIndex(idx)
  }, [])

  const commit = useCallback(
    (item: DefaultReactSuggestionItem) => {
      if (!item.block) return
      const target =
        sourceBlockIds.length === 1 ? sourceBlockIds[0]! : sourceBlockIds
      editor.commands.turnInto(target, item.block)
      onAfterApply?.()
      // After turnInto the selection-driven open path (toolbar) will
      // re-evaluate — but only if PM has focus. Reclaim it so subsequent
      // keystrokes go to the doc, not nowhere.
      editor.view.focus()
    },
    [editor, sourceBlockIds, onAfterApply],
  )

  // Keyboard nav. Only the toolbar surface needs this — the side-menu
  // submenu rides on the parent dropdown's own keyboard handling.
  useEffect(() => {
    if (!captureKeyboard) return
    const close = () => onClose?.()
    const handler = (event: KeyboardEvent) => {
      const consumed = handleSuggestionNavKey(event, {
        items,
        selectedIndex,
        setSelectedIndex: setKeyboardSelectedIndex,
        commit,
        close,
      })
      if (consumed) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [captureKeyboard, items, selectedIndex, setKeyboardSelectedIndex, commit, onClose])

  // Empty groups → source not resolvable yet (transient) or source is a
  // table (no conversion targets in v1). Return null so the wrapper
  // doesn't render an empty list with chrome around it.
  if (groups.length === 0) return null

  return (
    <DefaultSuggestionMenu
      items={items}
      loadingState="loaded"
      selectedIndex={selectedIndex}
      revealSelectedItem={revealSelectedItem}
      onItemClick={commit}
      onItemHover={handleItemHover}
    />
  )
}
