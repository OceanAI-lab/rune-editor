// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorView } from "@tiptap/pm/view"
import { Slice } from "@tiptap/pm/model"
import { isInTable } from "@tiptap/pm/tables"

/**
 * Tiptap/PM `handlePaste` prop. Inspects clipboardData MIMEs and
 * intercepts only when `application/x-rune-doc` is present — the
 * internal lossless round-trip path. Other MIMEs (text/html, text/plain)
 * are left to PM's default flow, which will then call our
 * `transformPastedHTML` and/or `clipboardTextParser` props.
 *
 * Malformed rune-doc (third-party app sharing the MIME, or schema
 * version mismatch from older rune) falls through to HTML/text rather
 * than silently failing the paste.
 */
export function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
  const data = event.clipboardData
  if (!data) return false
  if (!data.types.includes("application/x-rune-doc")) return false

  // Inside a table, defer to prosemirror-tables' own `handlePaste`
  // (the `tableEditing` plugin, registered AFTER us in the handlePaste
  // chain). Our plugin runs first, so a blanket `replaceSelection` here
  // would short-circuit pm-tables' cell-aware paste and CORRUPT the
  // grid: a CellSelection slice is `tableRow`/cell nodes with
  // openStart/openEnd = 1, and dropping that into a target cell via
  // replaceSelection multiplies columns and scrambles rows (only the
  // first copied row lands). Returning false lets pm-tables receive the
  // HTML-parsed slice and run clipCells/insertCells — tiling the copied
  // rectangle correctly from the target cell. The rune-doc lossless path
  // is irrelevant in-cell anyway: cells hold `tableParagraph`, not body
  // blocks, so there are no id/depth attrs to preserve.
  if (isInTable(view.state)) return false

  // slice param (PM's HTML-parsed result) is discarded on the rune-doc
  // branch: we trust our own JSON over PM's HTML round-trip, which is
  // lossy for BlockId / depth attrs even though renderDOM emits them.
  try {
    const json = data.getData("application/x-rune-doc")
    const pmSlice = Slice.fromJSON(view.state.schema, JSON.parse(json))
    event.preventDefault()
    view.dispatch(view.state.tr.replaceSelection(pmSlice))
    return true
  } catch {
    return false
  }
}
