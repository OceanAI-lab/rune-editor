// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, describe, expect, it, vi } from "vitest"
import { createSelectStartGuard } from "./selectstart-guard"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createSelectStartGuard", () => {
  it("prevents selectstart while active and allows it after end", () => {
    const guard = createSelectStartGuard()

    guard.begin()
    const active = new Event("selectstart", { bubbles: true, cancelable: true })
    document.dispatchEvent(active)
    expect(active.defaultPrevented).toBe(true)

    guard.end()
    const inactive = new Event("selectstart", { bubbles: true, cancelable: true })
    document.dispatchEvent(inactive)
    expect(inactive.defaultPrevented).toBe(false)
  })

  it("adds and removes the capture listener idempotently", () => {
    const addSpy = vi.spyOn(document, "addEventListener")
    const removeSpy = vi.spyOn(document, "removeEventListener")
    const guard = createSelectStartGuard()

    guard.begin()
    guard.begin()
    guard.end()
    guard.end()

    const selectstartAdds = addSpy.mock.calls.filter(
      ([type, _listener, options]) => type === "selectstart" && options === true,
    )
    const selectstartRemoves = removeSpy.mock.calls.filter(
      ([type, _listener, options]) => type === "selectstart" && options === true,
    )

    expect(selectstartAdds).toHaveLength(1)
    expect(selectstartRemoves).toHaveLength(1)
  })

  it("destroy removes an active listener and is idempotent", () => {
    const guard = createSelectStartGuard()

    guard.begin()
    guard.destroy()
    guard.destroy()

    const afterDestroy = new Event("selectstart", { bubbles: true, cancelable: true })
    document.dispatchEvent(afterDestroy)
    expect(afterDestroy.defaultPrevented).toBe(false)
  })
})
