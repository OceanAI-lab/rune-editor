// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { chooseDropDepth, dropIndicatorLeftForDepth } from "./drop-depth"

describe("chooseDropDepth", () => {
  it("non-structural previous block only allows depth 0", () => {
    expect(chooseDropDepth({
      cursorX: 160,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: 4,
      previousIsStructural: false,
    })).toBe(0)
  })

  it("no previous block only allows depth 0", () => {
    expect(chooseDropDepth({
      cursorX: 190,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: null,
      previousIsStructural: false,
    })).toBe(0)
  })

  it("allows one deeper than a structural previous block", () => {
    expect(chooseDropDepth({
      cursorX: 100,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: 1,
      previousIsStructural: true,
    })).toBe(0)

    expect(chooseDropDepth({
      cursorX: 130,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: 1,
      previousIsStructural: true,
    })).toBe(1)

    expect(chooseDropDepth({
      cursorX: 160,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: 1,
      previousIsStructural: true,
    })).toBe(2)
  })

  it("clamps cursor left of the editor to depth 0", () => {
    expect(chooseDropDepth({
      cursorX: 40,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: 2,
      previousIsStructural: true,
    })).toBe(0)
  })

  it("clamps cursor far right to max depth", () => {
    expect(chooseDropDepth({
      cursorX: 1000,
      minLeft: 100,
      indentStepPx: 30,
      previousDepth: 2,
      previousIsStructural: true,
    })).toBe(3)
  })

  it("falls back to depth 0 when indent step is invalid", () => {
    expect(chooseDropDepth({
      cursorX: 160,
      minLeft: 100,
      indentStepPx: 0,
      previousDepth: 2,
      previousIsStructural: true,
    })).toBe(0)
  })
})

describe("dropIndicatorLeftForDepth", () => {
  it("maps depth back to minLeft plus indent steps", () => {
    expect(dropIndicatorLeftForDepth({
      minLeft: 100,
      indentStepPx: 30,
      depth: 2,
    })).toBe(160)
  })
})
