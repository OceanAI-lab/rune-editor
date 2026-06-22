// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/core/src/schema/blocks/paste-depth.test.ts
import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"

describe("createBlockSpec — depth parses data-rune-paste-depth fallback", () => {
  it("paragraph inherits depth from data-rune-paste-depth", () => {
    const editor = createTestEditor()
    editor.commands.insertContent(
      `<p data-rune-paste-depth="2">x</p>`,
    )
    const para = editor.state.doc.firstChild!
    expect(para.type.name).toBe("paragraph")
    expect(para.attrs.depth).toBe(2)
  })

  it("heading inherits depth from data-rune-paste-depth", () => {
    const editor = createTestEditor()
    editor.commands.insertContent(
      `<h2 data-rune-paste-depth="3">x</h2>`,
    )
    const n = editor.state.doc.firstChild!
    expect(n.type.name).toBe("heading")
    expect(n.attrs.depth).toBe(3)
  })

  it("explicit data-depth still wins over the fallback", () => {
    const editor = createTestEditor()
    editor.commands.insertContent(
      `<p data-depth="1" data-rune-paste-depth="9">x</p>`,
    )
    expect(editor.state.doc.firstChild!.attrs.depth).toBe(1)
  })
})
