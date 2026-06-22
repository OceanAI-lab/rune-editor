// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { mathControllerKey } from "../../inlines/InlineMath/controller"
import { createTestEditor } from "../../test-utils/createTestEditor"

describe("insertEquationBlock", () => {
  it("inserts equationBlock + trailing paragraph after the source block; records open intent", () => {
    const editor = createTestEditor()
    editor.commands.setContent("<p>before</p>")
    const before = editor.state.doc.childCount  // 1
    const ok = editor.commands.insertEquationBlock({ latex: "x^2" })
    expect(ok).toBe(true)
    // Source paragraph + equationBlock + trailing paragraph = 3
    expect(editor.state.doc.childCount).toBe(before + 2)

    expect(editor.state.doc.child(0).type.name).toBe("paragraph")
    expect(editor.state.doc.child(1).type.name).toBe("equationBlock")
    expect(editor.state.doc.child(1).attrs.latex).toBe("x^2")
    expect(editor.state.doc.child(2).type.name).toBe("paragraph")
    expect(editor.state.doc.child(2).content.size).toBe(0)

    const intent = mathControllerKey.getState(editor.state)?.openTarget
    expect(intent).not.toBeNull()
    expect(editor.state.doc.nodeAt(intent!)?.type.name).toBe("equationBlock")
  })

  it("replaces an empty paragraph in-place + still adds a trailing paragraph", () => {
    const editor = createTestEditor()
    editor.commands.setContent("<p></p>")
    const ok = editor.commands.insertEquationBlock({ latex: "" })
    expect(ok).toBe(true)
    // Empty source replaced by equation + trailing paragraph = 2
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.firstChild?.type.name).toBe("equationBlock")
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
  })

  it("defaults latex to empty string when no options provided", () => {
    const editor = createTestEditor()
    editor.commands.setContent("<p>hi</p>")
    editor.commands.insertEquationBlock()
    // Equation is child index 1 (after the source paragraph)
    expect(editor.state.doc.child(1).attrs.latex).toBe("")
  })

  it("returns false when editor is not editable", () => {
    const editor = createTestEditor()
    editor.setEditable(false)
    expect(editor.commands.insertEquationBlock({ latex: "x" })).toBe(false)
  })
})
