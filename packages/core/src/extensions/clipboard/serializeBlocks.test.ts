// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor, Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { createRuneKit as kit } from "../../kit"
import { buildClipboardSerializer } from "./serializer"
import { serializeBlocksForClipboard } from "./serializeBlocks"

function makeEditor() {
  // Mirror writeClipboard.test.ts: wire the same clipboardSerializer so
  // serializeForClipboard routes through it. We register a second plugin
  // instead of relying on the kit's Clipboard extension to avoid loading
  // the full clipboard plugin's other hooks under jsdom.
  const SerializerExt = Extension.create({
    name: "clipboard-serializer-test",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: { clipboardSerializer: buildClipboardSerializer(this.editor) },
        }),
      ]
    },
  })
  return new Editor({
    extensions: [...kit(), SerializerExt],
    content: "<p>aaa</p><h2>bbb</h2><p>ccc</p>",
    element: document.createElement("div"),
  })
}

describe("serializeBlocksForClipboard", () => {
  it("on selectAll: html is chrome-free (no rune-block / data-id)", () => {
    const editor = makeEditor()
    editor.commands.selectAll()
    const out = serializeBlocksForClipboard(editor.view)
    // PM may decorate the first/last node with `data-pm-slice` for slice
    // openness — middle nodes are clean. Check a middle node looks right
    // and that no chrome attrs leak.
    expect(out.html).toContain("bbb")
    expect(out.html).not.toContain("rune-block")
    expect(out.html).not.toContain("data-id")
    expect(out.html).not.toContain("data-depth")
    expect(out.text.length).toBeGreaterThan(0)
    const json = JSON.parse(out.runeDocJson)
    expect(json.content.length).toBe(3)
    editor.destroy()
  })

  it("on empty selection: returns empty html/text and null runeDocJson", () => {
    const editor = makeEditor()
    // Caret only, no range selection — slice is empty.
    const out = serializeBlocksForClipboard(editor.view)
    expect(out.html).toBe("")
    expect(out.text).toBe("")
    // slice.toJSON() === null for empty slices.
    expect(JSON.parse(out.runeDocJson)).toBeNull()
    editor.destroy()
  })

  it("accepts an explicit slice (whole-doc range, regardless of selection)", () => {
    const editor = makeEditor()
    // Selection sits at caret (empty), but we ask for the whole doc.
    const fullSlice = editor.state.doc.slice(0, editor.state.doc.content.size)
    const out = serializeBlocksForClipboard(editor.view, fullSlice)
    expect(out.text.length).toBeGreaterThan(0)
    expect(out.html).toContain("bbb")
    expect(out.html).not.toContain("rune-block")
    const json = JSON.parse(out.runeDocJson)
    expect(json.content.length).toBe(3)
    editor.destroy()
  })

  it("computes text/plain from an explicit slice instead of the current selection", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [
            { type: "text", text: "a " },
            { type: "inlineMath", attrs: { latex: "x" } },
          ],
        },
      ],
    })
    editor.commands.focus("start")

    const fullSlice = editor.state.doc.slice(0, editor.state.doc.content.size)
    const out = serializeBlocksForClipboard(editor.view, fullSlice)

    expect(out.text).toContain("a")
    expect(out.text).toContain("$x$")
    editor.destroy()
  })

  it("uses ProseMirror textBetween block-separator behavior for non-text atom blocks", () => {
    const editor = makeEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "a" }] },
        { type: "divider", attrs: { id: "d1", depth: 0 } },
        { type: "paragraph", attrs: { id: "p2" }, content: [{ type: "text", text: "b" }] },
      ],
    })

    const fullSlice = editor.state.doc.slice(0, editor.state.doc.content.size)
    const out = serializeBlocksForClipboard(editor.view, fullSlice)

    expect(out.text).toBe("a\n\nb")
    editor.destroy()
  })
})
