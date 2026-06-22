// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import type { Editor } from "@tiptap/react"
import type { Content } from "@tiptap/core"
import { RuneEditor } from "../RuneEditor"
import { mockEditorCoords } from "../test-utils/mockEditorCoords"

function renderEditor(content: Content, onReady?: (editor: Editor) => void) {
  let editor: Editor | null = null
  render(
    <RuneEditor
      content={content}
      onReady={(ed) => {
        if (editor) return
        mockEditorCoords(ed)
        editor = ed
        onReady?.(ed)
      }}
    />,
  )
  return waitFor(() => expect(editor).not.toBeNull()).then(() => editor!)
}

const fixture = (latex: string): Content => ({
  type: "doc",
  content: [{ type: "equationBlock", attrs: { id: "eq1", latex } }],
})

describe("EquationBlockNodeView", () => {
  it("renders the empty placeholder when latex is empty", async () => {
    await renderEditor(fixture(""))
    expect(await screen.findByText("Add a TeX equation")).toBeInTheDocument()
    expect(screen.queryByText(/Invalid equation/)).toBeNull()
  })

  it("renders KaTeX display HTML when latex is valid", async () => {
    await renderEditor(fixture("x^2"))
    await waitFor(() => {
      expect(document.querySelector(".katex-display")).not.toBeNull()
    })
  })

  it("renders the inline error banner when latex is invalid", async () => {
    await renderEditor(fixture("x^"))
    await waitFor(() => {
      const banner = document.querySelector(".rune-equation-error")
      expect(banner?.textContent).toMatch(/Expected group after/)
    })
  })

  it("places .rune-side-menu-host inside the wrapper (anti-nesting probe for stray .rune-block children)", async () => {
    await renderEditor(fixture("x^2"))
    await waitFor(() => {
      // React NodeView atoms intentionally carry `rune-block` on BOTH
      // the ReactRenderer outer (so `.rune-block`-targeted decorations
      // land — see project_react_nodeview_decoration_renderer_element
      // memory) AND the NodeViewWrapper. This test verifies:
      //   1. The equation-block content is rendered exactly once.
      //   2. No extra `.rune-block` descendants leak inside
      //      `.rune-equation-block` (would catch a stray wrapper).
      //   3. `.rune-side-menu-host` is a child of a `.rune-block`,
      //      not a sibling.
      const equationDivs = document.querySelectorAll(
        '[data-type="equation-block"]',
      )
      expect(equationDivs.length).toBe(1)
      const equationDiv = equationDivs[0]!
      // No nested .rune-block inside the equation content
      expect(equationDiv.querySelector(".rune-block")).toBeNull()
      // Side-menu host is a sibling of the equation content, both inside
      // the .rune-block wrapper.
      const host = document.querySelector(".rune-side-menu-host")
      expect(host).not.toBeNull()
      expect(host?.parentElement?.classList.contains("rune-block")).toBe(true)
      expect(host?.parentElement?.contains(equationDiv)).toBe(true)
    })
  })

  it("readonly mode: clicking the block does NOT open the popover", async () => {
    const editor = await renderEditor(fixture("x^2"))
    act(() => {
      editor.setEditable(false)
    })
    const block = document.querySelector(
      '[data-type="equation-block"]',
    ) as HTMLElement
    block.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    )
    // Popover never mounts — `Equation (LaTeX)` is the popover textarea label.
    expect(screen.queryByLabelText("Equation (LaTeX)")).toBeNull()
  })
})
