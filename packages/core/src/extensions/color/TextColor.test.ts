// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../../blocks/Paragraph/block"
import { TextStyleWithColorAttrs } from "./TextStyleWithColorAttrs"
import { TextColor } from "."

const setup = () =>
  new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, TextStyleWithColorAttrs, TextColor],
  })

describe("TextColor", () => {
  it("registers `runeTextColor` extension", () => {
    const editor = setup()
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "runeTextColor",
    )
    expect(ext).toBeDefined()
    editor.destroy()
  })

  it("`removeEmptyTextStyle` chain command is available (TextStyle assumption lock)", () => {
    // Both setRune*Color and unsetRune*Color call .removeEmptyTextStyle()
    // — a chain helper registered by upstream's TextStyle.addCommands.
    // If a future Tiptap version renames or drops it, our commands stop
    // cleaning up empty marks silently. Catch that here, not at runtime.
    const editor = setup()
    expect(typeof (editor.commands as Record<string, unknown>).removeEmptyTextStyle).toBe("function")
    editor.destroy()
  })

  it("setRuneTextColor('blue') over a text selection writes the mark attr", () => {
    const editor = setup()
    editor.commands.setContent("<p>hello</p>")
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setRuneTextColor("blue")
    const p = editor.state.doc.firstChild!
    const text = p.firstChild!
    const mark = text.marks.find((m) => m.type.name === "textStyle")
    expect(mark?.attrs.textColor).toBe("blue")
    editor.destroy()
  })

  it("setRuneTextColor('default') coalesces to null (never stored)", () => {
    const editor = setup()
    editor.commands.setContent("<p>hello</p>")
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setRuneTextColor("blue")
    editor.commands.setRuneTextColor("default")
    const text = editor.state.doc.firstChild!.firstChild!
    const mark = text.marks.find((m) => m.type.name === "textStyle")
    // Either the mark is gone, or its textColor attr is null.
    if (mark) expect(mark.attrs.textColor).toBeNull()
    else expect(mark).toBeUndefined()
    editor.destroy()
  })

  it("unsetRuneTextColor removes the mark when it leaves no other attrs", () => {
    const editor = setup()
    editor.commands.setContent("<p>hello</p>")
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setRuneTextColor("blue")
    editor.commands.unsetRuneTextColor()
    const text = editor.state.doc.firstChild!.firstChild!
    const mark = text.marks.find((m) => m.type.name === "textStyle")
    expect(mark).toBeUndefined()
    editor.destroy()
  })

  it("renders <span data-text-color='blue'> in the editor DOM", () => {
    const editor = setup()
    editor.commands.setContent("<p>hello</p>")
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.setRuneTextColor("blue")
    const html = editor.getHTML()
    expect(html).toContain('data-text-color="blue"')
    expect(html).toContain("hello")
    editor.destroy()
  })

  it("parses styleless <span data-text-color> (wrapper round-trip)", () => {
    // This is the test that originally lived in TextStyleWithColorAttrs.test.ts
    // — moved here because it can only succeed when a global attr is
    // registered to round-trip. Validates the parseDOM rules we added in
    // Task 2 actually fire.
    const editor = setup()
    editor.commands.setContent(
      '<p><span data-text-color="blue">hi</span></p>',
    )
    const text = editor.state.doc.firstChild!.firstChild!
    const mark = text.marks.find((m) => m.type.name === "textStyle")
    expect(mark?.attrs.textColor).toBe("blue")
    editor.destroy()
  })

  it("round-trips own-output: getHTML(setContent(html)) keeps data-text-color", () => {
    const editor = setup()
    const input = '<p><span data-text-color="blue">hi</span></p>'
    editor.commands.setContent(input)
    const out = editor.getHTML()
    expect(out).toContain('data-text-color="blue"')
    editor.destroy()
  })

  it("parses inline style='color: <hex>' via nearestColorName (external paste)", () => {
    const editor = setup()
    editor.commands.setContent(
      '<p><span style="color:#83abe1">hi</span></p>',
    )
    const text = editor.state.doc.firstChild!.firstChild!
    const mark = text.marks.find((m) => m.type.name === "textStyle")
    expect(mark?.attrs.textColor).toBe("blue")
    editor.destroy()
  })
})
