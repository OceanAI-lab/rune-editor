// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { createBlockSpec } from "./createSpec"
import { replaceWithNode } from "./internal"

const Para = createBlockSpec({
  type: "paragraph",
  content: "inline*",
  parseDOM: [{ tag: "p" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
})

const Heading = createBlockSpec({
  type: "heading",
  content: "inline*",
  props: {
    level: {
      default: 2,
      parseHTML: () => 2,
      renderHTML: () => ({}),
    },
  },
  parseDOM: [{ tag: "h2" }],
  renderDOM: ({ HTMLAttributes }) => ["h2", HTMLAttributes, 0],
})

function mkEditor(content?: string) {
  const editor = new Editor({
    extensions: [Document, Text, Para, Heading],
    content: content ?? "<p></p>",
  })
  return editor
}

describe("replaceWithNode — textblock target", () => {
  it("converts a paragraph to a heading and drops the trigger text", () => {
    const editor = mkEditor("<p>## hello</p>")
    // Range covers the trigger text "## " at the start of the paragraph.
    // Paragraph node is at position 0; first text position is 1.
    const triggerStart = 1
    const triggerEnd = triggerStart + "## ".length
    const tr = replaceWithNode(editor.state, { from: triggerStart, to: triggerEnd }, {
      type: "heading",
      props: { level: 2 },
    })
    expect(tr).not.toBeNull()
    editor.view.dispatch(tr!)
    expect(editor.state.doc.firstChild?.type.name).toBe("heading")
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2)
    expect(editor.state.doc.textContent).toBe("hello")
    editor.destroy()
  })
})

const TestAtom = createBlockSpec({
  type: "test-atom",
  content: "",
  parseDOM: [{ tag: "hr" }],
  renderDOM: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, class: "rune-block" },
    ["hr"],
  ],
})

function mkEditorWithAtom(content?: string) {
  return new Editor({
    extensions: [Document, Text, Para, Heading, TestAtom],
    content: content ?? "<p></p>",
  })
}

describe("replaceWithNode — atom target", () => {
  it("replaces the containing block with the atom, appends trailing paragraph, sets caret in it", () => {
    const editor = mkEditorWithAtom("<p>--- </p>")
    const triggerStart = 1
    const triggerEnd = triggerStart + "--- ".length
    const tr = replaceWithNode(editor.state, { from: triggerStart, to: triggerEnd }, {
      type: "test-atom",
    })
    expect(tr).not.toBeNull()
    editor.view.dispatch(tr!)

    // (a) first child is the atom
    expect(editor.state.doc.firstChild?.type.name).toBe("test-atom")
    // (b) doc has a trailing empty paragraph
    expect(editor.state.doc.childCount).toBeGreaterThanOrEqual(2)
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
    expect(editor.state.doc.lastChild?.textContent).toBe("")
    // (c) selection landed inside the trailing paragraph
    const $sel = editor.state.selection.$from
    expect($sel.parent.type.name).toBe("paragraph")
    editor.destroy()
  })

  it("does not double-append when the doc already has a block after", () => {
    const editor = mkEditorWithAtom("<p>--- </p><p>after</p>")
    const triggerStart = 1
    const triggerEnd = triggerStart + "--- ".length
    const tr = replaceWithNode(editor.state, { from: triggerStart, to: triggerEnd }, {
      type: "test-atom",
    })
    expect(tr).not.toBeNull()
    editor.view.dispatch(tr!)

    // 2 blocks total: the atom, then the original "after" paragraph. No third one.
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.firstChild?.type.name).toBe("test-atom")
    expect(editor.state.doc.lastChild?.textContent).toBe("after")
    editor.destroy()
  })
})
