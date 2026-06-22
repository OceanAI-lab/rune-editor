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
import { BlockBackgroundColor } from "."

const setup = () =>
  new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, BlockBackgroundColor],
  })

describe("BlockBackgroundColor", () => {
  it("registers `runeBlockBackgroundColor` and adds backgroundColor attr to paragraph", () => {
    const editor = setup()
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "runeBlockBackgroundColor",
    )
    expect(ext).toBeDefined()

    editor.commands.setContent("<p>x</p>")
    const p = editor.state.doc.firstChild!
    expect(p.attrs.backgroundColor).toBeNull()
    editor.destroy()
  })

  it("setBlockBackgroundColor(pos, 'blue') writes the attr", () => {
    const editor = setup()
    editor.commands.setContent("<p>x</p>")
    editor.commands.setBlockBackgroundColor(0, "blue")
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBe("blue")
    editor.destroy()
  })

  it("setBlockBackgroundColor(pos, null) clears the attr", () => {
    const editor = setup()
    editor.commands.setContent("<p>x</p>")
    editor.commands.setBlockBackgroundColor(0, "blue")
    editor.commands.setBlockBackgroundColor(0, null)
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBeNull()
    editor.destroy()
  })

  it("setBlockBackgroundColor(pos, 'default') coalesces to null (never stored)", () => {
    const editor = setup()
    editor.commands.setContent("<p>x</p>")
    editor.commands.setBlockBackgroundColor(0, "default")
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBeNull()
    editor.destroy()
  })

  it("renders data-background-color on the rendered HTML", () => {
    const editor = setup()
    editor.commands.setContent("<p>hello</p>")
    editor.commands.setBlockBackgroundColor(0, "blue")
    const html = editor.getHTML()
    // Loose match — Task 4 tightens this to assert the attr lands on
    // .rune-block-content specifically. For now we just need it
    // somewhere in the rendered subtree.
    expect(html).toContain('data-background-color="blue"')
    editor.destroy()
  })

  it("parses data-background-color from the .rune-block-content wrapper (walk-up)", () => {
    const editor = setup()
    editor.commands.setContent(
      '<div class="rune-block"><div class="rune-block-content" data-background-color="blue"><p>hi</p></div></div>',
    )
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBe("blue")
    editor.destroy()
  })

  it("parses inline style='background-color: <hex>' via nearestColorName (external paste)", () => {
    const editor = setup()
    editor.commands.setContent('<p style="background-color:#233850">hi</p>')
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBe("blue")
    editor.destroy()
  })

  // keepOnSplit: false — pressing Enter on a coloured block must produce
  // a fresh new block with backgroundColor=null. Color is a deliberate
  // per-block choice, not something the user implicitly opted into for
  // every subsequent block they type.
  it("Enter on a coloured block produces a fresh block with null backgroundColor", () => {
    const editor = setup()
    editor.commands.setContent("<p>x</p>")
    editor.commands.setBlockBackgroundColor(0, "blue")
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBe("blue")

    // Caret to end of the coloured paragraph, then split.
    editor.commands.setTextSelection(2)
    editor.commands.splitBlock()

    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.firstChild!.attrs.backgroundColor).toBe("blue")
    // The newly created block must NOT inherit the colour.
    expect(editor.state.doc.child(1).attrs.backgroundColor).toBeNull()
    editor.destroy()
  })
})
