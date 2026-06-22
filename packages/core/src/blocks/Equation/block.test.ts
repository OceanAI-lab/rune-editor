// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { getBlockSpecs } from "../../schema"

describe("equationBlock schema", () => {
  it("creates an equationBlock atom with default empty latex", () => {
    const editor = createTestEditor()
    const type = editor.schema.nodes.equationBlock
    expect(type).toBeDefined()
    expect(type!.isAtom).toBe(true)
    expect(type!.isBlock).toBe(true)
    const node = type!.create()
    expect(node.attrs.latex).toBe("")
  })

  it("round-trips latex through parseDOM → renderDOM", () => {
    const editor = createTestEditor()
    editor.commands.setContent(
      '<div data-type="equation-block" data-latex="x^2"></div>',
    )
    const first = editor.state.doc.firstChild
    expect(first?.type.name).toBe("equationBlock")
    expect(first?.attrs.latex).toBe("x^2")
  })

  it("renderDOM at depth > 0 preserves the --rune-block-depth style variable", () => {
    const editor = createTestEditor()
    editor.commands.setContent(
      '<div data-type="equation-block" data-latex="x^2" data-depth="1"></div>',
    )
    const root = editor.view.dom.querySelector(".rune-block") as HTMLElement | null
    expect(root).not.toBeNull()
    // data-depth must round-trip…
    expect(root!.getAttribute("data-depth")).toBe("1")
    // …and the inline style must contain BOTH the depth driver and our
    // --block-pad-top — a regression here means dragging the equation
    // into a list bumps the attr but renders with zero visual indent.
    const styleAttr = root!.getAttribute("style") ?? ""
    expect(styleAttr).toContain("--rune-block-depth")
    expect(styleAttr).toContain("--block-pad-top")
  })

  it("toRuneBlock emits top-level latex (not nested under props)", () => {
    const editor = createTestEditor()
    // createBlockSpec stores toRuneBlock on the extension's storage
    // (see the `addStorage` block in createSpec.ts), NOT on
    // options.spec. Use the registry helper to look it up.
    const spec = getBlockSpecs(editor).equationBlock
    expect(spec).toBeDefined()
    const type = editor.schema.nodes.equationBlock
    const node = type!.create({ latex: "E = mc^2", depth: 0, id: "abc" })
    expect(spec!.toRuneBlock!(node)).toEqual({
      type: "equationBlock",
      id: "abc",
      depth: 0,
      latex: "E = mc^2",
    })
  })
})
