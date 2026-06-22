// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { mergeBlockHTMLAttributes } from "./htmlAttributes"

describe("mergeBlockHTMLAttributes", () => {
  it("injects rune-block, preserves factory attrs, and appends block classes", () => {
    expect(
      mergeBlockHTMLAttributes(
        {
          "data-id": "a1",
          "data-depth": "2",
          class: "from-factory",
          style: "--rune-block-depth: 2;",
        },
        { className: "rune-equation-block" },
      ),
    ).toMatchObject({
      "data-id": "a1",
      "data-depth": "2",
      class: "rune-block from-factory rune-equation-block",
      style: "--rune-block-depth: 2;",
    })
  })

  it("merges style vars without clobbering inherited declarations", () => {
    const attrs = mergeBlockHTMLAttributes(
      { style: "--rune-block-depth: 2; color: red;" },
      {
        styleVars: {
          "--block-pad-top": "0.75rem",
          "--rune-block-depth": 3,
        },
      },
    )

    // Three declarations must appear; pin the substrings (key+value) but
    // not the exact whitespace / trailing-semicolon serialization.
    const style = attrs.style as string
    expect(style).toContain("--rune-block-depth: 3")
    expect(style).toContain("color: red")
    expect(style).toContain("--block-pad-top: 0.75rem")
    // Override-in-place: the inherited `--rune-block-depth: 2` should be
    // gone, replaced by the caller's value, NOT duplicated.
    expect(style.match(/--rune-block-depth/g)?.length).toBe(1)
    expect(style).not.toContain("--rune-block-depth: 2")
  })

  it("preserves inherited declaration order; appended caller vars come last", () => {
    const attrs = mergeBlockHTMLAttributes(
      { style: "--rune-block-depth: 2; color: red;" },
      { styleVars: { "--block-pad-top": "0.75rem" } },
    )

    const style = attrs.style as string
    const depthIdx = style.indexOf("--rune-block-depth")
    const colorIdx = style.indexOf("color: red")
    const padIdx = style.indexOf("--block-pad-top")
    expect(depthIdx).toBeGreaterThanOrEqual(0)
    expect(depthIdx).toBeLessThan(colorIdx)
    expect(colorIdx).toBeLessThan(padIdx)
  })
})
