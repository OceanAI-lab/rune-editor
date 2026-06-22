// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import type { Editor } from "@tiptap/core"
import {
  recordColorUse,
  getRecentColors,
  getColorFrequency,
} from "./recentColors"

// The store is keyed by Editor identity via a WeakMap, so any stable object
// reference stands in for an editor — no real Tiptap instance needed.
function fakeEditor(): Editor {
  return {} as Editor
}

describe("recentColors", () => {
  it("returns [] for an editor with no recorded picks", () => {
    expect(getRecentColors(fakeEditor())).toEqual([])
  })

  it("orders by recency, newest first", () => {
    const editor = fakeEditor()
    recordColorUse(editor, "text", "red", 1)
    recordColorUse(editor, "text", "blue", 2)
    recordColorUse(editor, "background", "yellow", 3)
    expect(getRecentColors(editor)).toEqual([
      { kind: "background", name: "yellow" },
      { kind: "text", name: "blue" },
      { kind: "text", name: "red" },
    ])
  })

  it("tracks the same color independently as text vs background", () => {
    const editor = fakeEditor()
    recordColorUse(editor, "text", "blue", 1)
    recordColorUse(editor, "background", "blue", 2)
    const recent = getRecentColors(editor)
    expect(recent).toHaveLength(2)
    expect(recent).toContainEqual({ kind: "text", name: "blue" })
    expect(recent).toContainEqual({ kind: "background", name: "blue" })
  })

  it("re-using a color bumps it to the front without duplicating", () => {
    const editor = fakeEditor()
    recordColorUse(editor, "text", "red", 1)
    recordColorUse(editor, "text", "blue", 2)
    recordColorUse(editor, "text", "red", 3)
    const recent = getRecentColors(editor)
    expect(recent).toEqual([
      { kind: "text", name: "red" },
      { kind: "text", name: "blue" },
    ])
  })

  it("honours the limit", () => {
    const editor = fakeEditor()
    recordColorUse(editor, "text", "red", 1)
    recordColorUse(editor, "text", "blue", 2)
    recordColorUse(editor, "text", "green", 3)
    expect(getRecentColors(editor, 2)).toEqual([
      { kind: "text", name: "green" },
      { kind: "text", name: "blue" },
    ])
  })

  it("never records the `default` clearer", () => {
    const editor = fakeEditor()
    recordColorUse(editor, "text", "default", 1)
    recordColorUse(editor, "background", "default", 2)
    expect(getRecentColors(editor)).toEqual([])
    expect(getColorFrequency(editor)).toEqual({})
  })

  it("keeps separate editors isolated", () => {
    const a = fakeEditor()
    const b = fakeEditor()
    recordColorUse(a, "text", "red", 1)
    expect(getRecentColors(a)).toEqual([{ kind: "text", name: "red" }])
    expect(getRecentColors(b)).toEqual([])
  })

  it("drops names no longer in the palette (stale rehydrated recents)", () => {
    const editor = fakeEditor()
    // A host rehydrated a pick for a color that's since been renamed/removed.
    // It must be filtered out, not surfaced — RecentRow would otherwise read
    // COLORS[name].label off undefined and crash the toolbar render.
    recordColorUse(editor, "text", "ultraviolet" as never, 1)
    recordColorUse(editor, "text", "blue", 2)
    expect(getRecentColors(editor)).toEqual([{ kind: "text", name: "blue" }])
  })
})
