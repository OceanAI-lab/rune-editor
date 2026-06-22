// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import {
  createIndicator,
  hideIndicator,
  positionIndicator,
  positionIndicatorVertical,
} from "./indicator"

// F6 — the drop indicator gets a VERTICAL variant for armed edge zones (a
// full-height bar at the zone edge). Same fixed-position element; the two
// position helpers must each fully re-assert the orientation so a
// vertical→horizontal frame (cursor leaves the zone) cannot leak the other
// orientation's geometry.

function makeIndicator(): HTMLElement {
  return createIndicator(document.createElement("div"))
}

describe("drop indicator orientation", () => {
  it("positionIndicatorVertical renders a 2px-wide bar of the given height", () => {
    const el = makeIndicator()
    positionIndicatorVertical(el, 320, 100, 250)
    // The 2px bar is centered ON the zone edge: left = x - 1.
    expect(el.style.left).toBe("319px")
    expect(el.style.top).toBe("100px")
    expect(el.style.width).toBe("2px")
    expect(el.style.height).toBe("250px")
    expect(el.style.display).toBe("block")
    el.remove()
  })

  it("positionIndicator (horizontal) resets the height after a vertical frame", () => {
    const el = makeIndicator()
    positionIndicatorVertical(el, 320, 100, 250)
    positionIndicator(el, 50, 400, 600)
    expect(el.style.left).toBe("50px")
    expect(el.style.top).toBe("400px")
    expect(el.style.width).toBe("600px")
    expect(el.style.height).toBe("2px")
    el.remove()
  })

  it("positionIndicatorVertical after a horizontal frame narrows the bar", () => {
    const el = makeIndicator()
    positionIndicator(el, 50, 400, 600)
    positionIndicatorVertical(el, 320, 100, 250)
    expect(el.style.width).toBe("2px")
    expect(el.style.height).toBe("250px")
    el.remove()
  })

  it("hideIndicator still hides either orientation", () => {
    const el = makeIndicator()
    positionIndicatorVertical(el, 320, 100, 250)
    hideIndicator(el)
    expect(el.style.display).toBe("none")
    el.remove()
  })
})
