// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// `requireTypedTrigger` — Notion session-start model (user-verified
// 2026-06-11, follow-up to the slash-menu edge-case report): a suggestion
// session only ever STARTS on the transaction that typed/inserted the
// trigger char at the anchor. Placing the caret into a dead `/query` run —
// by click, arrow keys, or loading a doc that already contains one — must
// never reopen the menu. Mirrors the kit's `/` trigger config.
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { createBlockSpec } from "../../schema"
import { SuggestionMenus } from "./SuggestionMenus"
import { getSuggestionMenus } from "./getSuggestionMenus"
import { slashMatcher } from "./matchers/slashMatcher"
import { AGENT_WRITE_META } from "../agent-write-meta"

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

function mk(content = "<p></p>") {
  return new Editor({
    element: container,
    extensions: [
      Document,
      Text,
      Para,
      SuggestionMenus.configure({
        // Same shape as the kit's `/` trigger.
        triggers: [
          {
            char: "/",
            allowSpaces: true,
            matcher: slashMatcher,
            requireTypedTrigger: true,
          },
        ],
      }),
    ],
    content,
  })
}

function snap(editor: Editor) {
  return getSuggestionMenus(editor).triggers["/"]!.getSnapshot()
}

describe("requireTypedTrigger — caret placement never opens a session", () => {
  it("doc already containing a slash run: caret into it stays closed", async () => {
    const editor = mk("<p>drop a column /dd here</p><p>target</p>")
    editor.commands.setTextSelection(1 + "drop a column /dd".length)
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)
  })

  it("session exited by caret-move: returning caret does not reopen", async () => {
    const editor = mk("<p></p><p>target</p>")
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    editor.commands.insertContent("dd")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
    const runEnd = editor.state.selection.from

    // Caret leaves to the second paragraph — natural exit, no dismissal.
    editor.commands.setTextSelection(editor.state.doc.content.size - 2)
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)

    editor.commands.setTextSelection(runEnd)
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)
  })

  // [SM-1] The `sessionAlive` typed-trigger bypass must never approve a
  // re-anchored match: while a session is open, a caret-only move past a
  // dead `/` run closes the session instead of silently adopting the dead
  // run (which would later let an item-pick delete committed text).
  it("[SM-1] open session + caret-only jump past a dead run closes (gate bypass stays safe)", async () => {
    const editor = mk("<p>note /dd here</p><p></p>")
    editor.commands.setTextSelection(16)
    editor.commands.insertContent("/")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
    expect(snap(editor).range?.from).toBe(16)

    editor.commands.setTextSelection(14)
    await Promise.resolve()
    const s = snap(editor)
    expect(s.show).toBe(false)
    expect(s.range).toBeNull()
  })

  it("typing MORE text inside a dead run does not revive it", async () => {
    const editor = mk("<p>note /dd</p>")
    editor.commands.setTextSelection(1 + "note /dd".length)
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)

    // The inserted char is query-range text, not the anchor char.
    editor.commands.insertContent("x")
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)
  })
})

describe("requireTypedTrigger — typed/inserted triggers still open", () => {
  it("a typed '/' opens, query keystrokes keep the session alive", async () => {
    const editor = mk()
    editor.commands.insertContent("/")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)

    editor.commands.insertContent("he")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
    expect(snap(editor).query).toBe("he")
  })

  it("openSlashMenu (gutter `+` path) opens", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
  })

  it("a fresh '/' typed inside a block that already holds a dead run opens at the NEW anchor", async () => {
    const editor = mk("<p>note /dd and</p>")
    const end = 1 + "note /dd and".length
    editor.commands.setTextSelection(end)
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)

    editor.commands.insertContent(" /")
    await Promise.resolve()
    const s = snap(editor)
    expect(s.show).toBe(true)
    expect(s.range?.from).toBe(end + 1)
    expect(s.query).toBe("")
  })

  it("backspace past the '/' closes; retyping '/' reopens", async () => {
    const editor = mk()
    editor.commands.insertContent("/")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)

    editor.commands.deleteRange({ from: 1, to: 2 })
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)

    editor.commands.insertContent("/")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
  })
})

// An AI/agent tool inserts content programmatically (the AI agent-tool layer stamps
// AGENT_WRITE_META on the dispatched transaction). The user did not type the
// `/`, so it must NOT open the slash menu — even though the transaction
// genuinely inserts the char at the anchor and would otherwise pass the
// `requireTypedTrigger` gate. Mirrors the existing paste suppression.
describe("requireTypedTrigger — an agent write never opens a session", () => {
  it("inserting '/' under AGENT_WRITE_META stays closed", async () => {
    const editor = mk()
    editor.chain().setMeta(AGENT_WRITE_META, true).insertContent("/").run()
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)
  })

  it("inserting a block whose text ENDS in '/' stays closed", async () => {
    const editor = mk()
    editor.chain().setMeta(AGENT_WRITE_META, true).insertContent("and/or /").run()
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)
  })

  it("control: the SAME insert without the meta DOES open (proves the meta is load-bearing)", async () => {
    const editor = mk()
    editor.commands.insertContent("/")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
  })

  it("a later USER-typed '/' still opens after an agent write (suppression is per-anchor)", async () => {
    const editor = mk()
    editor.chain().setMeta(AGENT_WRITE_META, true).insertContent("note /").run()
    await Promise.resolve()
    expect(snap(editor).show).toBe(false)

    // User types a fresh '/' at a new anchor — a real keystroke, unsuppressed.
    editor.commands.insertContent(" /")
    await Promise.resolve()
    expect(snap(editor).show).toBe(true)
  })
})
