// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { mathControllerKey } from "./controller"

describe("MathController", () => {
  it("stores open intent from transaction meta", () => {
    const editor = createTestEditor({ content: "<p>abc</p>" })

    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "open", pos: 2 }))

    expect(mathControllerKey.getState(editor.state)?.openTarget).toBe(2)
  })

  it("maps open intent through non-meta document changes", () => {
    const editor = createTestEditor({ content: "<p>abc</p>" })
    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "open", pos: 3 }))

    editor.view.dispatch(editor.state.tr.insertText("z", 1))

    expect(mathControllerKey.getState(editor.state)?.openTarget).toBe(4)
  })

  it("clears intent when the target is deleted", () => {
    const editor = createTestEditor({ content: "<p>abc</p>" })
    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "open", pos: 2 }))

    editor.view.dispatch(editor.state.tr.delete(1, 4))

    expect(mathControllerKey.getState(editor.state)?.openTarget).toBeNull()
  })

  it("clears intent when consumed", () => {
    const editor = createTestEditor({ content: "<p>abc</p>" })
    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "open", pos: 2 }))

    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "consume" }))

    expect(mathControllerKey.getState(editor.state)?.openTarget).toBeNull()
  })

  it("clears local intent on remote collaboration transactions", () => {
    const editor = createTestEditor({ content: "<p>abc</p>" })
    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "open", pos: 2 }))

    editor.view.dispatch(editor.state.tr.setMeta("y-sync$", true))

    expect(mathControllerKey.getState(editor.state)?.openTarget).toBeNull()
  })

  it("clears local intent on prosemirror-collab transactions", () => {
    const editor = createTestEditor({ content: "<p>abc</p>" })
    editor.view.dispatch(editor.state.tr.setMeta(mathControllerKey, { type: "open", pos: 2 }))

    editor.view.dispatch(editor.state.tr.setMeta("collab$", true))

    expect(mathControllerKey.getState(editor.state)?.openTarget).toBeNull()
  })
})
