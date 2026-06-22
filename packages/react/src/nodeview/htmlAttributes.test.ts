// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import {
  coerceNodeViewStyle,
  mergeNodeViewHTMLAttributes,
} from "./htmlAttributes"

describe("coerceNodeViewStyle", () => {
  it("turns Tiptap string styles into React style objects", () => {
    expect(
      coerceNodeViewStyle(
        "--rune-block-depth: 2; --block-pad-top: 0.75rem;",
      ),
    ).toEqual({
      "--rune-block-depth": "2",
      "--block-pad-top": "0.75rem",
    })
  })

  it("passes object styles through and defaults missing styles to empty objects", () => {
    const style = { color: "red" }
    expect(coerceNodeViewStyle(style)).toBe(style)
    expect(coerceNodeViewStyle(undefined)).toEqual({})
  })
})

describe("mergeNodeViewHTMLAttributes", () => {
  it("injects rune-block, preserves inherited class, and appends caller class", () => {
    const { className } = mergeNodeViewHTMLAttributes(
      { class: "from-factory", "data-id": "e1" },
      { className: "rune-equation-block" },
    )
    expect(className.split(/\s+/).sort()).toEqual(
      ["from-factory", "rune-block", "rune-equation-block"].sort(),
    )
  })

  it("deduplicates rune-block when the inherited class already contains it", () => {
    const { className } = mergeNodeViewHTMLAttributes({
      class: "rune-block extra",
    })
    expect(className.match(/rune-block/g)?.length).toBe(1)
    expect(className).toContain("extra")
  })

  it("preserves the depth CSS var from a string-form inherited style", () => {
    const { style } = mergeNodeViewHTMLAttributes(
      { style: "--rune-block-depth: 2;" },
      { styleVars: { "--block-pad-top": "0.75rem" } },
    )
    expect(style).toMatchObject({
      "--rune-block-depth": "2",
      "--block-pad-top": "0.75rem",
    })
  })

  it("caller styleVars win on conflict with inherited style", () => {
    const { style } = mergeNodeViewHTMLAttributes(
      { style: "--rune-block-depth: 2;" },
      { styleVars: { "--rune-block-depth": 3 } },
    )
    expect((style as Record<string, string>)["--rune-block-depth"]).toBe("3")
  })

  it("passes through other attrs as rest (data-id / data-depth)", () => {
    const { rest } = mergeNodeViewHTMLAttributes({
      "data-id": "a1",
      "data-depth": "2",
      class: "x",
      style: "color: red;",
    })
    expect(rest).toEqual({ "data-id": "a1", "data-depth": "2" })
  })
})
