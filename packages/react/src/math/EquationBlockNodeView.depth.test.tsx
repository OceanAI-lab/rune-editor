// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { render, waitFor } from "@testing-library/react"
import type { Content } from "@tiptap/core"
import { RuneEditor } from "../RuneEditor"

// React-side counterpart of the draggable-blocks contract in
// packages/core/src/schema/blocks/depth-style-merge.test.ts. The core test
// uses `createTestEditor` which does NOT wire React NodeViews, so the
// equation block there falls through to the plain `renderDOM` path. This
// spec covers the React NodeView path explicitly — `RuneEditor` auto-
// installs `equationBlockReactNodeView` via `useRuneEditor`, so any future
// regression in EquationBlockNodeView's HTMLAttributes merge (e.g. forgot
// to spread inherited style, or overwrote `rune-block` class) fires here.
describe("equationBlockReactNodeView — depth contract", () => {
  it("preserves data-depth and --rune-block-depth on the wrapper at depth=2", async () => {
    const content: Content = {
      type: "doc",
      content: [
        { type: "equationBlock", attrs: { id: "eq1", depth: 2, latex: "x^2" } },
      ],
    }
    render(<RuneEditor content={content} />)

    await waitFor(() => {
      const block = document.querySelector<HTMLElement>(
        '.rune-block[data-id="eq1"]',
      )
      expect(block).not.toBeNull()
      expect(block!.getAttribute("data-depth")).toBe("2")
      // React applies CSSProperties keys via style.setProperty; jsdom
      // supports custom-property roundtrip via getPropertyValue, which is
      // the most-direct probe regardless of inline-style serialization.
      expect(block!.style.getPropertyValue("--rune-block-depth")).toBe("2")
      // Block-author's own var coexists with the inherited depth var.
      // The value points at the shared media pad-top token (#298).
      expect(block!.style.getPropertyValue("--block-pad-top")).toBe(
        "var(--rune-media-pad-top)",
      )
    })
  })

  it("drops --rune-block-depth and data-depth when depth=0", async () => {
    const content: Content = {
      type: "doc",
      content: [
        { type: "equationBlock", attrs: { id: "eq0", latex: "x^2" } },
      ],
    }
    render(<RuneEditor content={content} />)

    await waitFor(() => {
      const block = document.querySelector<HTMLElement>(
        '.rune-block[data-id="eq0"]',
      )
      expect(block).not.toBeNull()
      expect(block!.getAttribute("data-depth")).toBeNull()
      expect(block!.style.getPropertyValue("--rune-block-depth")).toBe("")
    })
  })
})
