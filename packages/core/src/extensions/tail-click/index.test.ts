// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Editor } from "@tiptap/core"
import type { Content } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { createBlockSpec } from "../../schema"
import { TailClick } from "./index"

const Para = createBlockSpec({
  type: "paragraph",
  content: "inline*",
  parseDOM: [{ tag: "p" }],
  renderDOM: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, class: "rune-block" },
    ["p", {}, 0],
  ],
})

const Divider = createBlockSpec({
  type: "divider",
  content: "",
  parseDOM: [{ tag: "hr" }],
  renderDOM: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, class: "rune-block" }, ["hr"]],
})

// Stand-in for heading / toggle-title: any non-paragraph textblock with
// inline content. The "refocus empty tail" branch must not engulf these.
const Heading = createBlockSpec({
  type: "heading",
  content: "inline*",
  parseDOM: [{ tag: "h2" }],
  renderDOM: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, class: "rune-block" },
    ["h2", {}, 0],
  ],
})

let container: HTMLDivElement
let editor: Editor

function makeEditor(content: Content): Editor {
  return new Editor({
    element: container,
    extensions: [Document, Text, Para, Divider, Heading, TailClick],
    content,
  })
}

// Stamp the last block's bottom so the "below last block" check fires.
// jsdom returns all-zero rects otherwise.
function stampLastBlockBottom(view: Editor["view"], bottom: number): void {
  const lastIdx = view.state.doc.childCount - 1
  let pos = 0
  for (let i = 0; i < lastIdx; i++) pos += view.state.doc.child(i).nodeSize
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) throw new Error("expected last block DOM")
  dom.getBoundingClientRect = () =>
    ({ top: bottom - 20, bottom, left: 0, right: 200, width: 200, height: 20 }) as DOMRect
}

function tailClick(target: HTMLElement, clientY: number): void {
  target.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 50, clientY }),
  )
  window.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 50, clientY }),
  )
}

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
  if (typeof document.elementFromPoint !== "function") {
    ;(document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => null
  }
})

afterEach(() => {
  editor?.destroy()
  container.remove()
  vi.restoreAllMocks()
})

describe("TailClick", () => {
  it("appends a paragraph when last block is non-empty and click is below it", () => {
    editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    })
    expect(editor.state.doc.childCount).toBe(1)

    stampLastBlockBottom(editor.view, 100)
    tailClick(container, 200)

    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
    expect(editor.state.doc.lastChild?.content.size).toBe(0)
    // Caret is in the new paragraph.
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1)
  })

  it("does not append a second paragraph when last is already empty", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
        { type: "paragraph" },
      ],
    })
    expect(editor.state.doc.childCount).toBe(2)

    stampLastBlockBottom(editor.view, 100)
    tailClick(container, 200)

    expect(editor.state.doc.childCount).toBe(2)
  })

  it("appends a paragraph when last block is an empty non-paragraph textblock (heading / toggle title)", () => {
    // Regression: heading and toggle both have `content: "inline*"`, so
    // `isTextblock` is true. The "refocus empty tail textblock" branch
    // was paragraph-shaped and accidentally swallowed these: clicking
    // below an empty heading / fresh toggle felt locked because the
    // caret just refocused into the existing empty title.
    editor = makeEditor({
      type: "doc",
      content: [{ type: "heading" }],
    })
    expect(editor.state.doc.childCount).toBe(1)

    stampLastBlockBottom(editor.view, 100)
    tailClick(container, 200)

    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
  })

  it("appends a paragraph when last block is an atom (divider)", () => {
    editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
        { type: "divider" },
      ],
    })
    expect(editor.state.doc.childCount).toBe(2)

    stampLastBlockBottom(editor.view, 100)
    tailClick(container, 200)

    expect(editor.state.doc.childCount).toBe(3)
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
  })

  it("does nothing when click is at or above the last block's bottom", () => {
    editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    })
    expect(editor.state.doc.childCount).toBe(1)

    stampLastBlockBottom(editor.view, 100)
    tailClick(container, 50)

    expect(editor.state.doc.childCount).toBe(1)
  })

  it("does not fire when mousedown target is inside .rune-block", () => {
    editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    })
    stampLastBlockBottom(editor.view, 100)

    const block = container.querySelector(".rune-block") as HTMLElement
    expect(block).toBeTruthy()
    tailClick(block, 200)

    expect(editor.state.doc.childCount).toBe(1)
  })

  it("ignores mousedown bubbling up from a nested child editor wrapper", () => {
    editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "outer" }] }],
    })
    stampLastBlockBottom(editor.view, 100)

    // Build a nested .rune-editor inside the outer .rune-editor — same
    // shape as a child editor mounted within outer chrome (e.g. a
    // comment thread or popover that hosts its own RuneEditor). The
    // outer listener attaches to the outer .rune-editor; bubble from
    // the child should be rejected because target.closest('.rune-editor')
    // resolves to the child, not the outer.
    const childEditor = document.createElement("div")
    childEditor.className = "rune-editor"
    container.appendChild(childEditor)

    // Click in the child's region. clientY > outer last block's bottom,
    // so without isolation the outer would append.
    childEditor.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 50, clientY: 200 }),
    )
    window.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 50, clientY: 200 }),
    )

    expect(editor.state.doc.childCount).toBe(1)
  })

  it("treats movement past 4px as a drag and does not append", () => {
    editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    })
    stampLastBlockBottom(editor.view, 100)

    container.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 50, clientY: 200 }),
    )
    window.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, button: 0, clientX: 80, clientY: 240 }),
    )
    window.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 80, clientY: 240 }),
    )

    expect(editor.state.doc.childCount).toBe(1)
  })
})
