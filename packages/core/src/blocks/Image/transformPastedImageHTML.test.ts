// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit } from "../../kit"
import { transformPastedImageHTML } from "./transformPastedImageHTML"

function withEditor<T>(
  kit: Parameters<typeof createRuneKit>[0],
  fn: (editor: Editor) => T,
): T {
  const editor = new Editor({
    extensions: createRuneKit(kit),
    element: document.createElement("div"),
  })
  try {
    return fn(editor)
  } finally {
    editor.destroy()
  }
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

describe("transformPastedImageHTML", () => {
  it("stamps img src when importImageUrl is configured", () => {
    withEditor({ importImageUrl: vi.fn() }, (editor) => {
      const doc = parse('<p>Before</p><img src="https://source.example/a.png" alt="A"><p>After</p>')

      transformPastedImageHTML(doc, editor.view, editor)

      const img = doc.body.querySelector("img")!
      expect(img.getAttribute("src")).toBeNull()
      expect(img.getAttribute("data-rune-paste-image")).toBe("https://source.example/a.png")
      expect(img.getAttribute("alt")).toBe("A")
    })
  })

  it("stamps img src when only importMediaUrl is configured", () => {
    withEditor({ importMediaUrl: vi.fn() }, (editor) => {
      const doc = parse('<img src="https://source.example/media.png" alt="Media">')

      transformPastedImageHTML(doc, editor.view, editor)

      const img = doc.body.querySelector("img")!
      expect(img.getAttribute("src")).toBeNull()
      expect(img.getAttribute("data-rune-paste-image")).toBe(
        "https://source.example/media.png",
      )
      expect(img.getAttribute("alt")).toBe("Media")
    })
  })

  it("stamps data URLs too", () => {
    withEditor({ importImageUrl: vi.fn() }, (editor) => {
      const doc = parse('<img src="data:image/png;base64,abc">')

      transformPastedImageHTML(doc, editor.view, editor)

      expect(doc.body.querySelector("img")?.getAttribute("data-rune-paste-image"))
        .toBe("data:image/png;base64,abc")
    })
  })

  it("leaves img src untouched without URL import hooks", () => {
    withEditor({}, (editor) => {
      const doc = parse('<img src="https://source.example/a.png">')

      transformPastedImageHTML(doc, editor.view, editor)

      const img = doc.body.querySelector("img")!
      expect(img.getAttribute("src")).toBe("https://source.example/a.png")
      expect(img.hasAttribute("data-rune-paste-image")).toBe(false)
    })
  })

  it("does nothing while read-only", () => {
    withEditor({ importImageUrl: vi.fn() }, (editor) => {
      editor.setEditable(false)
      const doc = parse('<img src="https://source.example/a.png">')

      transformPastedImageHTML(doc, editor.view, editor)

      expect(doc.body.querySelector("img")?.getAttribute("src"))
        .toBe("https://source.example/a.png")
    })
  })
})
