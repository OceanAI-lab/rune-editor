// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import type { Editor } from "@tiptap/core"

import { useBlockAnchor } from "./useBlockAnchor"
import { useSelectionAnchor } from "./useSelectionAnchor"

// The pure getters are parity-tested in anchors.test.ts. These tests cover the
// HOOK-specific behavior the getters don't have: the last-good-rect fallback
// (a failed live read must not jump the popover to the corner) and the
// callback-identity stability across renders.

type Coords = { left: number; right: number; top: number; bottom: number }

function makeEditor(opts: {
  coords?: Record<number, Coords>
  throwAt?: Set<number>
  elements?: Record<string, DOMRect | null>
  isDestroyed?: boolean
}): Editor {
  const coords = opts.coords ?? {}
  const throwAt = opts.throwAt ?? new Set<number>()
  const elements = opts.elements ?? {}
  return {
    isDestroyed: opts.isDestroyed ?? false,
    view: {
      coordsAtPos: (pos: number): Coords => {
        if (throwAt.has(pos)) throw new RangeError(`mock: invalid pos ${pos}`)
        const c = coords[pos]
        if (!c) throw new RangeError(`mock: no coords for pos ${pos}`)
        return c
      },
      dom: {
        querySelector: (selector: string) => {
          const match = /\[data-id="(.*)"\]$/.exec(selector)
          if (!match || match[1] === undefined) return null
          const rect = elements[match[1]]
          return rect ? { getBoundingClientRect: () => rect } : null
        },
      },
    },
  } as unknown as Editor
}

function tuple(rect: DOMRect | null): [number, number, number, number] | null {
  return rect && [rect.x, rect.y, rect.width, rect.height]
}

describe("useSelectionAnchor", () => {
  it("returns the live point rect, then falls back to it when a read fails", () => {
    const editor = makeEditor({
      coords: {
        5: { left: 100, right: 140, top: 50, bottom: 66 },
        20: { left: 300, right: 340, top: 80, bottom: 96 },
      },
      // pos 20 throws ONLY on the second call — simulate a transient bad read.
    })
    const throwNext = vi.spyOn(editor.view, "coordsAtPos")
    const { result } = renderHook(() =>
      useSelectionAnchor(editor, { from: 5, to: 20, head: 20 }),
    )
    // First call measures successfully (zero-height point at head).
    expect(tuple(result.current())).toEqual([300, 50, 0, 0])

    // Now make every coordsAtPos throw — the getter must yield the LAST good
    // rect, not null and not the origin.
    throwNext.mockImplementation(() => {
      throw new RangeError("transient")
    })
    expect(tuple(result.current())).toEqual([300, 50, 0, 0])
  })

  it("yields null before any successful measurement (null range)", () => {
    const editor = makeEditor({})
    const { result } = renderHook(() => useSelectionAnchor(editor, null))
    expect(result.current()).toBeNull()
  })

  it("honors the selection-height option", () => {
    const editor = makeEditor({
      coords: {
        5: { left: 100, right: 140, top: 50, bottom: 66 },
        20: { left: 300, right: 340, top: 80, bottom: 96 },
      },
    })
    const { result } = renderHook(() =>
      useSelectionAnchor(editor, { from: 5, to: 20, head: 20 }, { height: "selection" }),
    )
    expect(tuple(result.current())).toEqual([300, 50, 0, 46])
  })
})

describe("useBlockAnchor", () => {
  it("unions the resolved blocks, then falls back to the last good rect", () => {
    const elements: Record<string, DOMRect | null> = {
      a: new DOMRect(100, 50, 100, 30),
      b: new DOMRect(120, 90, 140, 50),
    }
    const editor = makeEditor({ elements })
    const { result } = renderHook(() => useBlockAnchor(editor, ["a", "b"]))
    expect(tuple(result.current())).toEqual([100, 50, 160, 90])

    // Remove both elements — the getter falls back to the last union, not null.
    delete elements.a
    delete elements.b
    expect(tuple(result.current())).toEqual([100, 50, 160, 90])
  })

  it("accepts a single id (degenerates to that block's rect)", () => {
    const editor = makeEditor({ elements: { only: new DOMRect(10, 20, 300, 40) } })
    const { result } = renderHook(() => useBlockAnchor(editor, "only"))
    expect(tuple(result.current())).toEqual([10, 20, 300, 40])
  })

  it("keeps a STABLE getter identity across re-renders with equal ids", () => {
    const editor = makeEditor({ elements: { a: new DOMRect(0, 0, 10, 10) } })
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useBlockAnchor(editor, ids),
      { initialProps: { ids: ["a"] } },
    )
    const first = result.current
    // New array literal, same contents → same getter identity (key-based memo).
    rerender({ ids: ["a"] })
    expect(result.current).toBe(first)
    // Different contents → new getter identity.
    rerender({ ids: ["a", "b"] })
    expect(result.current).not.toBe(first)
  })

  it("yields null before any successful measurement (null ids)", () => {
    const editor = makeEditor({})
    const { result } = renderHook(() => useBlockAnchor(editor, null))
    expect(result.current()).toBeNull()
  })
})
