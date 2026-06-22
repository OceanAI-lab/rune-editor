// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Regression guard: an open suggestion menu MUST close when a
// MultiBlockSelection is set. plugin.ts:handleKeyDown unconditionally
// swallows printable single-char keys while in MBS state — that's only
// safe because @tiptap/suggestion's onExit fires when selection ceases
// to be a TextSelection. If a future refactor lets the menu survive
// MBS, the swallow would silently eat the user's filter keystrokes.
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { History } from "@tiptap/extension-history"
import { Paragraph, Heading } from "../../blocks"
import { BlockId } from "../block-id"
import { SuggestionMenus } from "../suggestion-menus"
import { BlockSelection } from "./index"

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

type SlashStore = { getSnapshot: () => { show: boolean } }

function getSlashStore(editor: Editor): SlashStore {
  return (editor.storage as unknown as {
    suggestionMenus: { triggers: Record<string, SlashStore> }
  }).suggestionMenus.triggers["/"]!
}

describe("Probe: suggestion menu vs MultiBlockSelection", () => {
  it("entering MBS closes an open slash menu", async () => {
    const editor = new Editor({
      element: container,
      extensions: [
        Document, Text, Paragraph, Heading, History, BlockId,
        SuggestionMenus.configure({ triggers: [{ char: "/" }] }),
        BlockSelection,
      ],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "A" }] },
          { type: "paragraph", content: [{ type: "text", text: "B" }] },
        ],
      } as never,
    })

    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    expect(getSlashStore(editor).getSnapshot().show).toBe(true)

    editor.commands.selectAllBlocks()
    await Promise.resolve()

    expect(getSlashStore(editor).getSnapshot().show).toBe(false)

    editor.destroy()
  })
})
