// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"

type DocLike = {
  content: Array<{
    type: string
    attrs?: { depth?: number }
    content?: unknown
  }>
}

function shape(editor: ReturnType<typeof createTestEditor>): string[] {
  const doc = editor.state.doc.toJSON() as DocLike
  return doc.content.map(
    (b) => `${b.type}@${b.attrs?.depth ?? 0}/${b.content ? "txt" : "∅"}`,
  )
}

function pressKey(editor: ReturnType<typeof createTestEditor>, key: string): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  })
  let handled = false
  editor.view.someProp("handleKeyDown", (handler) => {
    if (handler(editor.view, event)) {
      handled = true
      return true
    }
    return false
  })
  return handled
}

describe("Indent Backspace — Notion-style exit-the-list", () => {
  it("Enter on nested list creates same-depth empty item; sequential Backspaces convert to paragraph then outdent", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "numberedList", attrs: { depth: 0 }, content: [{ type: "text", text: "one" }] },
          { type: "numberedList", attrs: { depth: 1 }, content: [{ type: "text", text: "a" }] },
          { type: "numberedList", attrs: { depth: 2 }, content: [{ type: "text", text: "i" }] },
        ],
      } as never,
    })

    editor.commands.setTextSelection(editor.state.doc.content.size - 1)

    editor.commands.keyboardShortcut("Enter")
    expect(shape(editor)).toEqual([
      "numberedList@0/txt",
      "numberedList@1/txt",
      "numberedList@2/txt",
      "numberedList@2/∅",
    ])

    editor.commands.keyboardShortcut("Backspace")
    expect(shape(editor)).toEqual([
      "numberedList@0/txt",
      "numberedList@1/txt",
      "numberedList@2/txt",
      "paragraph@2/∅", // exit list, same depth
    ])

    editor.commands.keyboardShortcut("Backspace")
    expect(shape(editor)).toEqual([
      "numberedList@0/txt",
      "numberedList@1/txt",
      "numberedList@2/txt",
      "paragraph@1/∅", // outdent
    ])

    editor.commands.keyboardShortcut("Backspace")
    expect(shape(editor)).toEqual([
      "numberedList@0/txt",
      "numberedList@1/txt",
      "numberedList@2/txt",
      "paragraph@0/∅", // outdent — plain paragraph
    ])
  })

  it("applies to bulletList and taskList as well", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "bulletList", attrs: { depth: 0 }, content: [{ type: "text", text: "x" }] },
          { type: "bulletList", attrs: { depth: 1 } },
        ],
      } as never,
    })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.keyboardShortcut("Backspace")
    expect(shape(editor)).toEqual(["bulletList@0/txt", "paragraph@1/∅"])
  })

  it("keeps selection in the converted paragraph before the following child block", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "numberedList", attrs: { depth: 0 }, content: [{ type: "text", text: "parent" }] },
          { type: "numberedList", attrs: { depth: 1 }, content: [{ type: "text", text: "child" }] },
          { type: "numberedList", attrs: { depth: 2 }, content: [{ type: "text", text: "grandchild" }] },
        ],
      } as never,
    })

    const childStart = editor.state.doc.child(0)!.nodeSize
    const child = editor.state.doc.child(1)!
    editor.commands.setTextSelection(childStart + 1 + child.content.size)

    pressKey(editor, "Enter")
    pressKey(editor, "Backspace")
    expect(editor.state.selection.$from.node(1).type.name).toBe("paragraph")
    editor.commands.insertContent("Middle text paragraph")

    const doc = editor.state.doc.toJSON() as {
      content: Array<{ type: string; attrs?: { depth?: number }; content?: Array<{ text?: string }> }>
    }
    expect(doc.content.map((b) => `${b.type}@${b.attrs?.depth ?? 0}:${b.content?.[0]?.text ?? ""}`)).toEqual([
      "numberedList@0:parent",
      "numberedList@1:child",
      "paragraph@1:Middle text paragraph",
      "numberedList@2:grandchild",
    ])
  })

  it("non-empty list item Backspace at start still outdents (depth>0 path unchanged)", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "numberedList", attrs: { depth: 0 }, content: [{ type: "text", text: "one" }] },
          { type: "numberedList", attrs: { depth: 1 }, content: [{ type: "text", text: "a" }] },
        ],
      } as never,
    })

    // cursor at start of "a"
    const secondStart = editor.state.doc.firstChild!.nodeSize + 1
    editor.commands.setTextSelection(secondStart)
    editor.commands.keyboardShortcut("Backspace")
    expect(shape(editor)).toEqual([
      "numberedList@0/txt",
      "numberedList@0/txt", // outdented from depth 1, type kept
    ])
  })
})
