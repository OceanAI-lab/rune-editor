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
import { dismissSuggestionMenu } from "./dismissSuggestionMenu"
import { getSuggestionMenus } from "./getSuggestionMenus"

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

function mk() {
  return new Editor({
    element: container,
    extensions: [
      Document,
      Text,
      Para,
      SuggestionMenus.configure({ triggers: [{ char: "/", allowSpaces: true }] }),
    ],
    content: "<p></p>",
  })
}

function store(editor: Editor) {
  return getSuggestionMenus(editor).triggers["/"]!
}

describe("dismissSuggestionMenu", () => {
  it("exits the menu without deleting the typed trigger range", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    editor.commands.insertContent("to")
    await Promise.resolve()
    expect(editor.state.doc.textContent).toBe("/to")
    expect(store(editor).getSnapshot().show).toBe(true)

    expect(dismissSuggestionMenu(editor, "/")).toBe(true)
    await Promise.resolve()

    expect(editor.state.doc.textContent).toBe("/to")
    expect(store(editor).getSnapshot().show).toBe(false)
    expect(store(editor).suppressedAt.current).toBe(1)

    editor.commands.insertContent("d")
    await Promise.resolve()
    expect(editor.state.doc.textContent).toBe("/tod")
    expect(store(editor).getSnapshot().show).toBe(false)

    editor.commands.deleteRange({ from: 1, to: 2 })
    await Promise.resolve()
    expect(store(editor).suppressedAt.current).toBeNull()

    editor.destroy()
  })
})
