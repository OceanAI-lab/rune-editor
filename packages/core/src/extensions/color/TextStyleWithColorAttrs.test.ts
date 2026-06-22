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

const setup = () =>
  new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, TextStyleWithColorAttrs],
  })

describe("TextStyleWithColorAttrs", () => {
  it("registers under name 'textStyle' (replaces, not duplicates)", () => {
    const editor = setup()
    const marks = Object.keys(editor.schema.marks)
    expect(marks.filter((m) => m === "textStyle")).toHaveLength(1)
    editor.destroy()
  })

  it("adds parseDOM rules for styleless data-color spans", () => {
    const editor = setup()
    const rules = editor.schema.marks.textStyle!.spec.parseDOM ?? []
    expect(rules.some((r) => r.tag === "span[data-text-color]")).toBe(true)
    expect(
      rules.some((r) => r.tag === "span[data-background-color]"),
    ).toBe(true)
    editor.destroy()
  })

  it("preserves the base parseDOM rules (parent rules still present)", () => {
    const editor = setup()
    const rules = editor.schema.marks.textStyle!.spec.parseDOM ?? []
    // Tiptap's stock TextStyle has at least one rule for span[style]; the
    // wrapper appends to it via this.parent?.(), so total count > 2.
    expect(rules.length).toBeGreaterThan(2)
    editor.destroy()
  })
})
