// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { parseCssColor } from "./parseCssColor"

describe("parseCssColor", () => {
  it("parses #rrggbb", () => {
    expect(parseCssColor("#ada9a3")).toEqual({ r: 173, g: 169, b: 163 })
  })

  it("parses #rgb shorthand", () => {
    expect(parseCssColor("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc })
  })

  it("parses rgb() with spaces", () => {
    expect(parseCssColor("rgb(173, 169, 163)")).toEqual({ r: 173, g: 169, b: 163 })
  })

  it("parses rgba() and drops alpha", () => {
    expect(parseCssColor("rgba(173, 169, 163, 0.5)")).toEqual({ r: 173, g: 169, b: 163 })
  })

  it("is case-insensitive for hex", () => {
    expect(parseCssColor("#ADA9A3")).toEqual({ r: 173, g: 169, b: 163 })
  })

  it("trims whitespace", () => {
    expect(parseCssColor("  #ada9a3  ")).toEqual({ r: 173, g: 169, b: 163 })
  })

  it("returns null for CSS named colors", () => {
    expect(parseCssColor("red")).toBeNull()
    expect(parseCssColor("transparent")).toBeNull()
    expect(parseCssColor("inherit")).toBeNull()
  })

  it("returns null for empty / garbage", () => {
    expect(parseCssColor("")).toBeNull()
    expect(parseCssColor("not a color")).toBeNull()
    expect(parseCssColor("#gg0000")).toBeNull()
  })
})
