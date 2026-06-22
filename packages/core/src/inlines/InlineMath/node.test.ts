// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { mathControllerKey } from "./controller"

function chordHandler(editor: Editor): (arg: { editor: Editor }) => boolean {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "inlineMath")
  if (!ext) throw new Error("inlineMath extension not found")
  const ctx = { editor, type: ext, options: ext.options }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = (ext as any).config.addKeyboardShortcuts.call(ctx) as Record<
    string,
    (arg: { editor: Editor }) => boolean
  >
  const handler = map["Mod-Shift-e"]
  if (!handler) throw new Error("Mod-Shift-e binding missing on InlineMath")
  return handler
}

describe("InlineMath — schema and commands", () => {
  it("registers an inline selectable atom with a latex attribute", () => {
    const editor = createTestEditor({
      content: '<p>before <span data-type="inline-math" data-latex="E=mc^2"></span> after</p>',
    })

    const type = editor.schema.nodes.inlineMath
    expect(type).toBeDefined()
    if (!type) throw new Error("inlineMath schema node missing")
    expect(type.isInline).toBe(true)
    expect(type.isAtom).toBe(true)
    expect(type.spec.selectable).toBe(true)

    let mathNode = null as typeof editor.state.doc.firstChild | null
    editor.state.doc.descendants((node) => {
      if (node.type.name === "inlineMath") mathNode = node
      return true
    })
    expect(mathNode?.attrs.latex).toBe("E=mc^2")
    expect(editor.getHTML()).toContain('data-type="inline-math"')
    expect(editor.getHTML()).toContain('data-latex="E=mc^2"')
    expect(editor.getHTML()).toContain("$E=mc^2$")
  })

  it("insertInlineMath inserts an atom at the cursor and records open intent", () => {
    const editor = createTestEditor({
      content: "<p>hello</p>",
    })
    editor.commands.setTextSelection(3)

    expect(editor.commands.insertInlineMath({ latex: "x^2" })).toBe(true)

    const paragraph = editor.state.doc.firstChild
    expect(paragraph?.childCount).toBe(3)
    expect(paragraph?.child(1).type.name).toBe("inlineMath")
    expect(paragraph?.child(1).attrs.latex).toBe("x^2")

    const state = mathControllerKey.getState(editor.state)
    expect(state?.openTarget).toBe(3)
  })

  it("wrapSelectionAsInlineMath replaces selected text inside one textblock", () => {
    const editor = createTestEditor({
      content: "<p>alpha beta</p>",
    })
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)),
    )

    expect(editor.commands.wrapSelectionAsInlineMath()).toBe(true)

    const paragraph = editor.state.doc.firstChild
    expect(paragraph?.child(0).type.name).toBe("inlineMath")
    expect(paragraph?.child(0).attrs.latex).toBe("alpha")
    expect(paragraph?.textContent).toBe(" beta")
  })

  it("wrapSelectionAsInlineMath rejects selections spanning multiple blocks", () => {
    const editor = createTestEditor({
      content: "<p>alpha</p><p>beta</p>",
    })
    const before = editor.state.doc.toJSON()
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, 9)),
    )

    expect(editor.commands.wrapSelectionAsInlineMath()).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("Mod-Shift-e on a collapsed cursor inserts empty inline math", () => {
    const editor = createTestEditor({ content: "<p>hello</p>" })
    editor.commands.setTextSelection(3)

    const handler = chordHandler(editor)
    expect(handler({ editor })).toBe(true)

    const paragraph = editor.state.doc.firstChild
    expect(paragraph?.childCount).toBe(3)
    expect(paragraph?.child(1).type.name).toBe("inlineMath")
    expect(paragraph?.child(1).attrs.latex).toBe("")
    expect(mathControllerKey.getState(editor.state)?.openTarget).toBe(3)
  })

  it("Mod-Shift-e on a single-textblock selection wraps the text", () => {
    const editor = createTestEditor({ content: "<p>alpha beta</p>" })
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)),
    )

    const handler = chordHandler(editor)
    expect(handler({ editor })).toBe(true)

    const paragraph = editor.state.doc.firstChild
    expect(paragraph?.child(0).type.name).toBe("inlineMath")
    expect(paragraph?.child(0).attrs.latex).toBe("alpha")
  })

  it("Mod-Shift-e on a multi-block selection returns false (chord falls through)", () => {
    const editor = createTestEditor({ content: "<p>alpha</p><p>beta</p>" })
    const before = editor.state.doc.toJSON()
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, 9)),
    )

    const handler = chordHandler(editor)
    expect(handler({ editor })).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("Mod-Shift-e returns false in readonly editors", () => {
    const editor = createTestEditor({ content: "<p>hello</p>" })
    editor.commands.setTextSelection(3)
    editor.setEditable(false)
    const before = editor.state.doc.toJSON()

    const handler = chordHandler(editor)
    expect(handler({ editor })).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("math commands no-op when the editor is readonly", () => {
    const editor = createTestEditor({
      content: "<p>hello</p>",
    })
    editor.commands.setTextSelection(3)
    const before = editor.state.doc.toJSON()

    editor.setEditable(false)

    expect(editor.commands.insertInlineMath({ latex: "x" })).toBe(false)
    expect(editor.commands.wrapSelectionAsInlineMath()).toBe(false)
    expect(editor.state.doc.toJSON()).toEqual(before)
  })
})
