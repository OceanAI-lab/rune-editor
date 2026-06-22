// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import {
  DEFAULT_MEDIA_ALIGN,
  inputMediaAlignOrDefault,
  isMediaAlign,
  normalizeMediaAlign,
  parseMediaAlignAttr,
  renderMediaAlignAttr,
} from "./align"

describe("media align helpers", () => {
  it("normalizes unknown values to center", () => {
    expect(normalizeMediaAlign("left")).toBe("left")
    expect(normalizeMediaAlign("right")).toBe("right")
    expect(normalizeMediaAlign("center")).toBe("center")
    expect(normalizeMediaAlign("justify")).toBe("center")
    expect(normalizeMediaAlign(null)).toBe("center")
    expect(normalizeMediaAlign(undefined)).toBe("center")
    expect(normalizeMediaAlign(7)).toBe("center")
  })

  it("isMediaAlign guards the union", () => {
    expect(isMediaAlign("left")).toBe(true)
    expect(isMediaAlign("middle")).toBe(false)
    expect(isMediaAlign(null)).toBe(false)
  })

  it("inputMediaAlignOrDefault prefers the input, then the fallback, then center", () => {
    expect(inputMediaAlignOrDefault("right", "left")).toBe("right")
    expect(inputMediaAlignOrDefault(undefined, "left")).toBe("left")
    expect(inputMediaAlignOrDefault(undefined, undefined)).toBe(
      DEFAULT_MEDIA_ALIGN,
    )
    expect(inputMediaAlignOrDefault("bogus", "left")).toBe("center")
  })

  it("parseMediaAlignAttr reads data-align and rejects junk", () => {
    const el = document.createElement("div")
    expect(parseMediaAlignAttr(el)).toBeNull()

    el.setAttribute("data-align", "right")
    expect(parseMediaAlignAttr(el)).toBe("right")

    el.setAttribute("data-align", "diagonal")
    expect(parseMediaAlignAttr(el)).toBeNull()
  })

  it("renderMediaAlignAttr emits data-align only for non-center", () => {
    expect(renderMediaAlignAttr({ align: "center" })).toEqual({})
    expect(renderMediaAlignAttr({ align: undefined })).toEqual({})
    expect(renderMediaAlignAttr({ align: "left" })).toEqual({
      "data-align": "left",
    })
    expect(renderMediaAlignAttr({ align: "right" })).toEqual({
      "data-align": "right",
    })
  })
})
