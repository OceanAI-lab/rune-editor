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
      SuggestionMenus.configure({
        // allowSpaces mirrors the kit's `/` trigger config so multi-word
        // queries like "heading 1" stay alive instead of ending on the
        // first space — that distinction is what the suppression rewrite
        // protects against.
        triggers: [{ char: "/", allowSpaces: true }],
      }),
    ],
    content: "<p></p>",
  })
}

function store(editor: Editor) {
  return getSuggestionMenus(editor).triggers["/"]!
}

describe("suggestion suppression", () => {
  it("shouldShow gate blocks matches at the suppressedAt position", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    expect(store(editor).getSnapshot().show).toBe(true)

    // Simulate the React controller arming suppression after items=0.
    store(editor).suppressedAt.current = 1
    // Nudge the suggestion plugin to re-evaluate the gate.
    editor.view.dispatch(editor.state.tr)
    await Promise.resolve()
    expect(store(editor).getSnapshot().show).toBe(false)

    // Extending the query at the same `/` keeps it blocked, even though
    // the regex still matches.
    editor.commands.insertContent("h")
    await Promise.resolve()
    expect(store(editor).getSnapshot().show).toBe(false)
  })

  it("multi-word queries keep the suggestion active (allowSpaces=true)", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    editor.commands.insertContent("heading 1")
    await Promise.resolve()
    // Space in the middle is part of the filter, NOT a terminator.
    expect(store(editor).getSnapshot().show).toBe(true)
    expect(store(editor).getSnapshot().query).toBe("heading 1")
    // No automatic suppression from a single space.
    expect(store(editor).suppressedAt.current).toBeNull()
  })

  it("deleting back into a matching range stays suppressed", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    editor.commands.insertContent("headingdfa")
    await Promise.resolve()

    // Arm suppression (mirrors React controller's items=0 path).
    store(editor).suppressedAt.current = 1
    editor.view.dispatch(editor.state.tr)
    await Promise.resolve()
    expect(store(editor).getSnapshot().show).toBe(false)

    // Delete "dfa" so the doc reads "/heading" — regex matches again
    // but suppressedAt still blocks the gate.
    const end = editor.state.selection.from
    editor.commands.deleteRange({ from: end - 3, to: end })
    await Promise.resolve()
    expect(editor.state.doc.textContent).toBe("/heading")
    expect(store(editor).getSnapshot().show).toBe(false)
  })

  it("guard clears suppressedAt when the trigger char is deleted", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    editor.commands.insertContent("foo")
    await Promise.resolve()
    store(editor).suppressedAt.current = 1
    editor.view.dispatch(editor.state.tr)
    await Promise.resolve()
    expect(store(editor).suppressedAt.current).toBe(1)

    // Delete the leading "/" — the guard plugin clears suppressedAt
    // because the trigger char is no longer at the recorded position.
    editor.commands.deleteRange({ from: 1, to: 2 })
    await Promise.resolve()
    expect(store(editor).suppressedAt.current).toBeNull()

    // Re-typing `/` reopens normally.
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    expect(store(editor).getSnapshot().show).toBe(true)
  })

  it("guard maps suppressedAt across doc edits before the trigger", async () => {
    const editor = mk()
    // Doc: "<p>hi/</p>" with the `/` at position 3 (1: <p>, 2: h, 3: i, 4: /).
    editor.commands.insertContent("hi/")
    await Promise.resolve()
    expect(editor.state.doc.textBetween(3, 4)).toBe("/")
    store(editor).suppressedAt.current = 3

    // Insert text BEFORE the trigger. The mapping should shift
    // suppressedAt forward so it still tracks the `/`.
    editor.commands.insertContentAt(1, "x")
    await Promise.resolve()
    expect(store(editor).suppressedAt.current).toBe(4)
    expect(editor.state.doc.textBetween(4, 5)).toBe("/")
  })
})
