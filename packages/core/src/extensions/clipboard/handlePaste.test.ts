// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { createRuneKit as kit } from "../../kit"
import { handlePaste } from "./handlePaste"

function makeEditor(content = "<p>seed</p>") {
  return new Editor({
    extensions: kit(),
    content,
    element: document.createElement("div"),
  })
}

// jsdom doesn't ship ClipboardEvent / DataTransfer. Mint a minimal mock.
function makePasteEvent(mimes: Record<string, string>): ClipboardEvent {
  const store = new Map<string, string>(Object.entries(mimes))
  const data = {
    get types() { return Array.from(store.keys()) },
    getData: (mime: string) => store.get(mime) ?? "",
    setData: (mime: string, value: string) => { store.set(mime, value) },
    clearData: () => store.clear(),
  } as unknown as DataTransfer
  let defaultPrevented = false
  const ev = {
    type: "paste",
    clipboardData: data,
    get defaultPrevented() { return defaultPrevented },
    preventDefault: () => { defaultPrevented = true },
  }
  return ev as unknown as ClipboardEvent
}

describe("handlePaste", () => {
  it("returns false when clipboard has no rune-doc MIME", () => {
    const editor = makeEditor()
    const event = makePasteEvent({ "text/html": "<p>x</p>" })
    expect(handlePaste(editor.view as any, event)).toBe(false)
    editor.destroy()
  })

  it("on rune-doc: parses, dispatches replaceSelection, returns true", () => {
    const editor = makeEditor()
    editor.commands.selectAll()
    const sourceSlice = editor.state.selection.content()
    const json = JSON.stringify(sourceSlice.toJSON())
    const event = makePasteEvent({ "application/x-rune-doc": json })
    expect(handlePaste(editor.view as any, event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    editor.destroy()
  })

  it("on malformed rune-doc: returns false (fall through to HTML/text)", () => {
    const editor = makeEditor()
    const event = makePasteEvent({ "application/x-rune-doc": "{not valid json" })
    expect(handlePaste(editor.view as any, event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    editor.destroy()
  })

  it("on rune-doc with valid JSON but invalid Slice schema: returns false", () => {
    const editor = makeEditor()
    const event = makePasteEvent({
      "application/x-rune-doc": JSON.stringify({ content: [{ type: "nonexistent_block" }] }),
    })
    expect(handlePaste(editor.view as any, event)).toBe(false)
    editor.destroy()
  })

  it("defers to prosemirror-tables when the caret is inside a table (returns false)", () => {
    // Regression: rune's handlePaste runs BEFORE pm-tables' cell-aware
    // handler. A blanket replaceSelection of a copied CellSelection slice
    // (tableRow/cell nodes, openStart/openEnd = 1) corrupts the grid —
    // columns multiply, only the first copied row lands. Inside a table we
    // must yield so pm-tables' clipCells/insertCells handles the paste.
    const editor = makeEditor(
      "<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table>",
    )
    // Put the caret inside the first cell's paragraph.
    let cellPos = -1
    editor.state.doc.descendants((node, pos) => {
      if (cellPos === -1 && node.type.name === "tableCell") cellPos = pos
    })
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.near(editor.state.doc.resolve(cellPos + 2)),
      ),
    )

    // A real internal copy always carries the rune-doc MIME; without the
    // in-table guard this would be intercepted and replaceSelection'd.
    const event = makePasteEvent({
      "application/x-rune-doc": JSON.stringify(
        editor.state.selection.content().toJSON(),
      ),
    })
    expect(handlePaste(editor.view as any, event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    editor.destroy()
  })
})
