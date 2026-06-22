// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"

function fresh() {
  return createTestEditor()
}

describe("Toggle title — inline marks", () => {
  it("setLink applies inside a level-2 title heading", () => {
    const editor = fresh()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 2, expanded: true }, content: [{ type: "text", text: "click me" }] },
    ])
    editor.commands.setTextSelection({ from: 1, to: 9 })
    editor.commands.setLink({ href: "https://example.com" })
    const html = editor.getHTML()
    expect(html).toMatch(/<h2[^>]*>[^<]*<a[^>]+href="https:\/\/example.com"/)
  })

  it("bold + color survive in title", () => {
    const editor = fresh()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: true }, content: [{ type: "text", text: "bold red" }] },
    ])
    editor.commands.setTextSelection({ from: 1, to: 5 })
    editor.commands.setMark("bold")
    expect(editor.getHTML()).toContain("<strong>bold</strong>")
  })

  it("autolink converts typed URL in title", () => {
    const editor = fresh()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: true }, content: [] },
    ])
    editor.commands.focus(1)
    editor.commands.insertContent("https://example.com ")
    const marks = editor.state.doc.firstChild!.firstChild?.marks ?? []
    expect(marks.some((m) => m.type.name === "link")).toBe(true)
  })

  it("wiki-link mark applies in title (data-wikilink survives in HTML)", () => {
    const editor = fresh()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: true }, content: [{ type: "text", text: "see " }] },
    ])
    editor.commands.setTextSelection(5)
    editor.commands.insertContent({
      type: "text",
      text: "Page",
      marks: [{ type: "wikiLink", attrs: { target: "Page" } }],
    })
    const html = editor.getHTML()
    expect(html).toContain('data-wikilink="Page"')
  })

  it("clipboard round-trip preserves level + a link in title (HTML)", () => {
    const src = fresh()
    src.commands.setContent([
      { type: "toggle", attrs: { level: 3, expanded: true }, content: [
        { type: "text", text: "go to ", marks: [] },
        { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://x.test" } }] },
      ] },
    ])
    const html = src.getHTML()
    const dst = fresh()
    dst.commands.setContent(html)
    const first = dst.state.doc.firstChild!
    expect(first.type.name).toBe("toggle")
    expect(first.attrs.level).toBe(3)
    expect(first.textContent).toBe("go to site")
    const marks = first.lastChild?.marks ?? []
    expect(marks.some((m) => m.type.name === "link" && m.attrs.href === "https://x.test")).toBe(true)
  })
})
