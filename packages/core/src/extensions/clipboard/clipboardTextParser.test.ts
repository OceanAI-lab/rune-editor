// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit as kit } from "../../kit"
import { clipboardTextParser } from "./clipboardTextParser"

function parse(text: string) {
  const editor = new Editor({ extensions: kit(), element: document.createElement("div") })
  const $context = editor.state.doc.resolve(0)
  const slice = clipboardTextParser(text, $context)
  const blocks: { type: string; text: string }[] = []
  slice.content.forEach((node) => blocks.push({ type: node.type.name, text: node.textContent }))
  editor.destroy()
  return blocks
}

describe("clipboardTextParser", () => {
  it("'a' → 1 paragraph 'a'", () => {
    expect(parse("a")).toEqual([{ type: "paragraph", text: "a" }])
  })

  it("'a\\nb' → 2 paragraphs", () => {
    expect(parse("a\nb")).toEqual([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
    ])
  })

  it("'a\\n\\nb' → 3 paragraphs (middle empty preserved)", () => {
    expect(parse("a\n\nb")).toEqual([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "" },
      { type: "paragraph", text: "b" },
    ])
  })

  it("'\\na\\n' → 1 paragraph 'a' (lstrip/rstrip blanks)", () => {
    expect(parse("\na\n")).toEqual([{ type: "paragraph", text: "a" }])
  })

  it("'a\\r\\nb' → 2 paragraphs (CRLF normalize)", () => {
    expect(parse("a\r\nb")).toEqual([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
    ])
  })

  it("'' → empty slice", () => {
    const editor = new Editor({ extensions: kit(), element: document.createElement("div") })
    const $context = editor.state.doc.resolve(0)
    expect(clipboardTextParser("", $context).size).toBe(0)
    editor.destroy()
  })

  it("returned slice has openStart=1, openEnd=1 for merge with surrounding paragraph", () => {
    const editor = new Editor({ extensions: kit(), element: document.createElement("div") })
    const $context = editor.state.doc.resolve(0)
    const slice = clipboardTextParser("a", $context)
    expect(slice.openStart).toBe(1)
    expect(slice.openEnd).toBe(1)
    editor.destroy()
  })
})
