// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core"
import { getBlockById } from "@ocai/rune-core"

export interface ScrollToBlockOptions {
  scrollRoot?: HTMLElement | null
  scrollOffset?: number
  select?: boolean
  behavior?: ScrollBehavior
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id)
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

function findBlockElement(editor: Editor, id: string): HTMLElement | null {
  const selector = `[data-id="${cssEscape(id)}"]`
  const scoped = editor.view.dom.querySelector<HTMLElement>(selector)
  if (scoped?.isConnected) return scoped
  return editor.view.dom.ownerDocument.querySelector<HTMLElement>(selector)
}

export function scrollToBlock(
  editor: Editor,
  blockId: string,
  opts: ScrollToBlockOptions = {},
): boolean {
  if (!getBlockById(editor, blockId)) return false
  const el = findBlockElement(editor, blockId)
  if (!el) return false
  const behavior: ScrollBehavior = opts.behavior ?? "smooth"
  el.scrollIntoView({ behavior, block: "start" })
  if (opts.scrollOffset) {
    const root = opts.scrollRoot ?? null
    const offset = opts.scrollOffset
    window.requestAnimationFrame(() => {
      if (root) root.scrollBy({ top: -offset, behavior })
      else window.scrollBy({ top: -offset, behavior })
    })
  }
  if (opts.select !== false) {
    editor.commands.setBlockSelection({ from: blockId, to: blockId })
  }
  return true
}
