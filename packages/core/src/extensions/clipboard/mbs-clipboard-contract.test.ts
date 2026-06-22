// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * M1 ↔ M2 dependency: M2's writeClipboard calls
 *   - selection.content() (copy path)
 *   - tr.deleteSelection() (cut path; internally calls selection.replace)
 * on the active selection. MultiBlockSelection (custom Selection class
 * shipped by M1) MUST satisfy these to allow copy/cut over multi-block
 * selections. This file asserts the contract — it is NOT a test of
 * MBS's own implementation, which lives in M1.
 */
import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit as kit } from "../../kit"
import { MultiBlockSelection } from "../block-selection/MultiBlockSelection"

function makeEditor() {
  return new Editor({
    extensions: kit(),
    content: "<p>aaa</p><p>bbb</p><p>ccc</p>",
    element: document.createElement("div"),
  })
}

describe("MultiBlockSelection — M2 clipboard contract", () => {
  it("content() returns a Slice containing all selected blocks in document order", () => {
    const editor = makeEditor()
    editor.commands.selectAllBlocks()
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)

    const slice = editor.state.selection.content()
    let count = 0
    slice.content.forEach(() => count++)
    expect(count).toBe(3)
    editor.destroy()
  })

  it("tr.deleteSelection() removes the selected blocks", () => {
    const editor = makeEditor()
    expect(editor.state.doc.childCount).toBe(3)
    editor.commands.selectAllBlocks()
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)

    editor.view.dispatch(editor.state.tr.deleteSelection())
    // PM preserves a single empty top-level block to keep the doc valid.
    // The 3 source paragraphs are gone, so document text content is empty.
    expect(editor.state.doc.textContent).toBe("")
    expect(editor.state.doc.childCount).toBe(1)
    editor.destroy()
  })
})
