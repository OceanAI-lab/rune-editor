// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"

type DocLike = {
  content: Array<{ type: string; attrs?: { level?: number }; content?: unknown }>
}

function blockTypes(editor: ReturnType<typeof createTestEditor>): string[] {
  const doc = editor.state.doc.toJSON() as DocLike
  return doc.content.map((b) =>
    b.type === "heading" ? `h${b.attrs?.level ?? "?"}` : b.type,
  )
}

describe("EmptyBlockBackspace — empty + empty pair", () => {
  it("Backspace at start of empty paragraph below empty heading deletes the paragraph, not the heading", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 } },
          { type: "paragraph" },
        ],
      } as never,
    })

    editor.commands.setTextSelection(3) // start of paragraph
    editor.commands.keyboardShortcut("Backspace")

    expect(blockTypes(editor)).toEqual(["h2"])
    // cursor should land inside the surviving heading
    expect(editor.state.selection.$from.parent.type.name).toBe("heading")
  })

  it("second Backspace from the now-current empty heading removes it", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "prev" }] },
          { type: "heading", attrs: { level: 2 } },
          { type: "paragraph" },
        ],
      } as never,
    })

    editor.commands.setTextSelection(9) // inside the empty trailing paragraph
    editor.commands.keyboardShortcut("Backspace")
    expect(blockTypes(editor)).toEqual(["paragraph", "h2"]) // first backspace collapses pair, keeps heading

    editor.commands.keyboardShortcut("Backspace")
    // second backspace falls through to PM defaults — heading is gone,
    // merged into the filled paragraph above it
    expect(blockTypes(editor)).toEqual(["paragraph"])
  })

  it("does NOT fire when the previous block is non-empty (PM defaults handle merge)", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] },
          { type: "paragraph" },
        ],
      } as never,
    })
    editor.commands.setTextSelection(5)
    editor.commands.keyboardShortcut("Backspace")
    expect(blockTypes(editor)).toEqual(["h2"]) // empty paragraph removed, filled heading survives
  })

  it("does NOT fire when the current block is non-empty (PM defaults merge content)", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 } },
          { type: "paragraph", content: [{ type: "text", text: "hello" }] },
        ],
      } as never,
    })
    editor.commands.setTextSelection(3)
    editor.commands.keyboardShortcut("Backspace")
    // current handler leaves this to PM — separate UX concern (which
    // block type wins when caret merges across blocks).
    expect(blockTypes(editor).length).toBe(1)
  })

  it("handles empty heading + empty heading pair (any-textblock-to-any-textblock)", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 } },
          { type: "heading", attrs: { level: 3 } },
        ],
      } as never,
    })
    editor.commands.setTextSelection(3) // start of second heading
    editor.commands.keyboardShortcut("Backspace")

    expect(blockTypes(editor)).toEqual(["h2"]) // h3 collapsed away, h2 preserved
  })
})
