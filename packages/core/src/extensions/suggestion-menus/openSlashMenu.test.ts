// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { createBlockSpec } from "../../schema"
import { SuggestionMenus } from "./SuggestionMenus"

const Para = createBlockSpec({
  type: "paragraph",
  content: "inline*",
  parseDOM: [{ tag: "p" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
})

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

function mk(content: string) {
  return new Editor({
    element: container,
    extensions: [
      Document,
      Text,
      Para,
      SuggestionMenus.configure({ triggers: [{ char: "/" }] }),
    ],
    content,
  })
}

describe("openSlashMenu command", () => {
  it("inserts '/' at pos and moves caret", () => {
    const editor = mk("<p>hello</p>")
    editor.commands.openSlashMenu({ pos: 1 })
    expect(editor.state.doc.textContent).toBe("/hello")
    expect(editor.state.selection.from).toBe(2)
    editor.destroy()
  })

  it("opens '/' trigger store (show: true)", async () => {
    const editor = mk("<p></p>")
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    const store = (editor.storage as unknown as { suggestionMenus: { triggers: Record<string, { getSnapshot: () => { show: boolean } }> } }).suggestionMenus.triggers["/"]!
    expect(store.getSnapshot().show).toBe(true)
    editor.destroy()
  })

  it("returns false when dispatch is not provided (dry run)", () => {
    const editor = mk("<p>hello</p>")
    const result = editor.can().openSlashMenu({ pos: 1 })
    expect(result).toBe(false)
    editor.destroy()
  })
})
