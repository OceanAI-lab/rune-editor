// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
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

function mk(placeholder?: string) {
  return new Editor({
    element: container,
    extensions: [
      Document,
      Text,
      Para,
      SuggestionMenus.configure({
        triggers: [{ char: "/", ...(placeholder ? { placeholder } : {}) }],
      }),
    ],
    content: "<p></p>",
  })
}

describe("trigger placeholder decoration", () => {
  it("adds rune-trigger--placeholder class with placeholder content while query is empty", async () => {
    const editor = mk("Type to search")
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()

    const span = container.querySelector<HTMLSpanElement>("span.rune-trigger")
    expect(span).not.toBeNull()
    expect(span!.classList.contains("rune-trigger--placeholder")).toBe(true)
    expect(span!.getAttribute("data-decoration-content")).toBe("Type to search")

    editor.destroy()
  })

  it("drops rune-trigger--placeholder once the user types a query char", async () => {
    const editor = mk("Type to search")
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()

    editor.commands.insertContent("a")
    await Promise.resolve()

    const span = container.querySelector<HTMLSpanElement>("span.rune-trigger")
    expect(span).not.toBeNull()
    expect(span!.classList.contains("rune-trigger--placeholder")).toBe(false)

    editor.destroy()
  })

  it("omits the placeholder attribute when no placeholder is configured", async () => {
    const editor = mk()
    editor.commands.openSlashMenu({ pos: 1 })
    await Promise.resolve()

    const span = container.querySelector<HTMLSpanElement>("span.rune-trigger")
    expect(span).not.toBeNull()
    // Empty string is still written by @tiptap/suggestion, but the CSS
    // rule's `content: attr(...)` on an empty attr renders nothing.
    expect(span!.getAttribute("data-decoration-content")).toBe("")

    editor.destroy()
  })

  it("keeps the editor root marked briefly after IME composition ends", async () => {
    vi.useFakeTimers()
    const editor = mk("Type to search")
    try {
      editor.commands.openSlashMenu({ pos: 1 })
      await Promise.resolve()

      editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }))
      expect(editor.view.dom.classList.contains("rune-ime-composing")).toBe(true)

      editor.view.dom.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }))
      expect(editor.view.dom.classList.contains("rune-ime-composing")).toBe(true)

      vi.advanceTimersByTime(49)
      expect(editor.view.dom.classList.contains("rune-ime-composing")).toBe(true)

      vi.advanceTimersByTime(1)
      expect(editor.view.dom.classList.contains("rune-ime-composing")).toBe(false)
    } finally {
      editor.destroy()
      vi.useRealTimers()
    }
  })
})
