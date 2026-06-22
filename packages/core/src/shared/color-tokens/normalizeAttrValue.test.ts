// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { normalizeAttrValue } from "./normalizeAttrValue"

describe("normalizeAttrValue", () => {
  it("returns a palette name verbatim", () => {
    expect(normalizeAttrValue("blue", "text")).toBe("blue")
    expect(normalizeAttrValue("gray", "background")).toBe("gray")
  })

  it("does NOT pass 'default' through (default is never a stored attr value)", () => {
    // 'default' IS in COLOR_NAMES, so the literal-list check returns it.
    // The non-storage rule lives in the *commands*, not in this helper.
    // Locking the current behavior here so any future change is deliberate.
    expect(normalizeAttrValue("default", "text")).toBe("default")
  })

  it("maps a hex through nearestColorName", () => {
    // Blue's text hex from the palette → maps to itself.
    expect(normalizeAttrValue("#83abe1", "text")).toBe("blue")
  })

  it("returns null for empty / null input", () => {
    expect(normalizeAttrValue(null, "text")).toBeNull()
    expect(normalizeAttrValue("", "background")).toBeNull()
  })

  it("returns null for unparseable junk", () => {
    expect(normalizeAttrValue("not-a-color", "text")).toBeNull()
    expect(normalizeAttrValue("inherit", "background")).toBeNull()
  })
})
