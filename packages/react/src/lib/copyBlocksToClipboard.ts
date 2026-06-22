// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Button-triggered clipboard copy for rune blocks. Pairs with rune-core's
// `serializeBlocksForClipboard` (which produces chrome-free html + text +
// rune-doc JSON) to give downstream UI a single call: serialize THEN write,
// synchronously, in a way that survives Radix menu-close focus shuffles.
//
// Why this exists instead of `navigator.clipboard.write([ClipboardItem])`:
// the async clipboard API silently rejects when the page loses focus during
// the await — and that is exactly what every popover/menu chrome does when
// it closes after the click. The synchronous `document.execCommand('copy')`
// + interception of the resulting `copy` event is the only reliable path
// for multi-format writes from a button in Chromium/Electron.
//
// Why NOT live in core: this helper touches `document`, `window.getSelection`,
// and `document.execCommand` — all DOM concerns. Core stays SSR/CLI/worker
// usable per the package boundary in CLAUDE.md.

import type { Editor } from "@tiptap/core"
import type { Slice } from "@tiptap/pm/model"
import { serializeBlocksForClipboard } from "@ocai/rune-core"

export type CopyBlocksRange =
  | { from: number; to: number }
  | "all"

function resolveSlice(editor: Editor, range: CopyBlocksRange | undefined): Slice {
  const doc = editor.state.doc
  if (range === "all") return doc.slice(0, doc.content.size)
  if (range) return doc.slice(range.from, range.to)
  return editor.state.selection.content()
}

/**
 * Copy a range of blocks (or the current selection by default) to the
 * system clipboard, synchronously. Writes text/html, text/plain, and the
 * rune-doc JSON MIME via a hijacked `copy` event — the same shape that
 * Cmd+C produces — so paste round-trips work identically from either
 * trigger.
 *
 * Returns the `execCommand('copy')` result. `false` means either the
 * range was empty or the browser refused the write (e.g. permissions in
 * non-secure contexts). Callers can show a fallback message; we don't
 * surface errors via throw so UI code never has to wrap this in try/catch.
 */
export function copyBlocksToClipboard(
  editor: Editor,
  range?: CopyBlocksRange,
): boolean {
  const slice = resolveSlice(editor, range)
  if (slice.size === 0) return false

  const payload = serializeBlocksForClipboard(editor.view, slice)

  // Chromium fires `copy` only when there's a non-empty selection at call
  // time. Stash a temp span, put a selection over it, and our `copy`
  // listener intercepts the event before the browser reads from that span.
  const temp = document.createElement("span")
  temp.textContent = " "
  temp.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;"
  document.body.appendChild(temp)

  const sel = window.getSelection()
  const previousRanges: Range[] = []
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      previousRanges.push(sel.getRangeAt(i).cloneRange())
    }
    sel.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(temp)
    sel.addRange(range)
  }

  const handler = (e: ClipboardEvent) => {
    if (!e.clipboardData) return
    e.preventDefault()
    e.clipboardData.setData("text/html", payload.html)
    e.clipboardData.setData("text/plain", payload.text)
    e.clipboardData.setData("application/x-rune-doc", payload.runeDocJson)
  }
  document.addEventListener("copy", handler, true)
  try {
    return document.execCommand("copy")
  } finally {
    document.removeEventListener("copy", handler, true)
    if (sel) {
      sel.removeAllRanges()
      for (const r of previousRanges) sel.addRange(r)
    }
    temp.remove()
  }
}
