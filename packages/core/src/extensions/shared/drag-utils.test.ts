// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi, afterEach } from "vitest"
import {
  getEditorVar,
  resolveCssLengthToPx,
  registerDragCancelHandlers,
} from "./drag-utils"

afterEach(() => {
  document.body.innerHTML = ""
  document.documentElement.style.fontSize = ""
})

describe("getEditorVar", () => {
  it("returns fallback when var unset", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    expect(getEditorVar(el, "--rune-indicator-bg", "rgba(0, 0, 0, 0.4)")).toBe(
      "rgba(0, 0, 0, 0.4)",
    )
  })
})

describe("resolveCssLengthToPx", () => {
  it("returns the numeric value for px and unitless input", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    expect(resolveCssLengthToPx("-28px", el)).toBe(-28)
    expect(resolveCssLengthToPx("12", el)).toBe(12)
    expect(resolveCssLengthToPx("  4.5px  ", el)).toBe(4.5)
  })

  it("resolves rem against the document root font-size", () => {
    document.documentElement.style.fontSize = "16px"
    const el = document.createElement("div")
    document.body.appendChild(el)
    expect(resolveCssLengthToPx("-2rem", el)).toBe(-32)
    expect(resolveCssLengthToPx("1.5rem", el)).toBe(24)
  })

  it("resolves em against the element font-size", () => {
    const el = document.createElement("div")
    el.style.fontSize = "20px"
    document.body.appendChild(el)
    expect(resolveCssLengthToPx("2em", el)).toBe(40)
  })

  it("returns 0 for unparseable input", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    expect(resolveCssLengthToPx("", el)).toBe(0)
    expect(resolveCssLengthToPx("auto", el)).toBe(0)
  })
})

describe("registerDragCancelHandlers", () => {
  it("fires cleanup on Escape", () => {
    const cleanup = vi.fn()
    const unregister = registerDragCancelHandlers(cleanup)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    expect(cleanup).toHaveBeenCalledTimes(1)
    unregister()
  })

  it("fires cleanup on pointercancel", () => {
    const cleanup = vi.fn()
    const unregister = registerDragCancelHandlers(cleanup)
    document.dispatchEvent(new Event("pointercancel"))
    expect(cleanup).toHaveBeenCalledTimes(1)
    unregister()
  })

  it("ignores non-Escape keys", () => {
    const cleanup = vi.fn()
    const unregister = registerDragCancelHandlers(cleanup)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
    expect(cleanup).not.toHaveBeenCalled()
    unregister()
  })
})
