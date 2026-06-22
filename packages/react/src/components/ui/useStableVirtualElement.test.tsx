// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useStableVirtualElement } from "./useStableVirtualElement"
import type { RuneAnchor } from "../../positioning/anchors"

function Probe({
  getClientRect,
  contextElement,
  onValue,
}: {
  getClientRect: (() => DOMRect | null) | RuneAnchor | null
  contextElement?: Element | null
  onValue: (value: { current: Element } | null) => void
}) {
  onValue(useStableVirtualElement(getClientRect, contextElement))
  return null
}

// floating-ui's autoUpdate unwraps the reference via `element.contextElement` to
// discover the rect's real scroll ancestors; without it a body-portaled popover
// only listens on window and detaches when an inner overflow:auto host scrolls.
type VirtualWithContext = Element & { contextElement?: Element }

describe("useStableVirtualElement", () => {
  it("returns null before the first usable rect", () => {
    let value: { current: Element } | null | undefined

    render(<Probe getClientRect={null} onValue={(next) => { value = next }} />)

    expect(value).toBeNull()
  })

  it("accepts a zero-size point anchor away from the viewport origin", () => {
    const point = new DOMRect(120, 80, 0, 0)
    let value: { current: Element } | null | undefined

    render(<Probe getClientRect={() => point} onValue={(next) => { value = next }} />)

    expect(value).not.toBeNull()
    expect(value?.current.getBoundingClientRect()).toBe(point)
  })

  it("keeps the last usable rect when the current getter disappears", () => {
    const first = new DOMRect(10, 20, 30, 40)
    const values: Array<{ current: Element } | null> = []

    const { rerender } = render(
      <Probe getClientRect={() => first} onValue={(next) => values.push(next)} />,
    )
    rerender(<Probe getClientRect={null} onValue={(next) => values.push(next)} />)

    const retained = values.at(-1)
    expect(retained).not.toBeNull()
    expect(retained?.current.getBoundingClientRect()).toBe(first)
  })

  it("keeps the last usable rect when the current getter returns null", () => {
    const first = new DOMRect(10, 20, 30, 40)
    let current: DOMRect | null = first
    const getClientRect = () => current
    const values: Array<{ current: Element } | null> = []

    const { rerender } = render(
      <Probe getClientRect={getClientRect} onValue={(next) => values.push(next)} />,
    )
    current = null
    rerender(<Probe getClientRect={getClientRect} onValue={(next) => values.push(next)} />)

    const retained = values.at(-1)
    expect(retained).not.toBeNull()
    expect(retained?.current.getBoundingClientRect()).toBe(first)
  })

  // Regression guard: Floating UI's autoUpdate calls getBoundingClientRect
  // on scroll/resize/rAF without a React rerender. If the hook snapshots
  // the rect at render time instead of delegating to the live getter, the
  // popover detaches from a scrolling anchor (see PR #148 review).
  it("re-reads the live getter on every measurement, without rerender", () => {
    let cur: DOMRect = new DOMRect(10, 20, 30, 40)
    const get = () => cur
    let captured: { current: Element } | null = null

    render(
      <Probe
        getClientRect={get}
        onValue={(next) => {
          captured = next
        }}
      />,
    )

    const next = new DOMRect(99, 99, 50, 50)
    cur = next
    expect(captured!.current.getBoundingClientRect()).toBe(next)
  })

  it("exposes the explicit contextElement on the virtual element", () => {
    const point = new DOMRect(120, 80, 0, 0)
    const host = document.createElement("div")
    let value: { current: Element } | null | undefined

    render(
      <Probe
        getClientRect={() => point}
        contextElement={host}
        onValue={(next) => {
          value = next
        }}
      />,
    )

    expect((value?.current as VirtualWithContext).contextElement).toBe(host)
  })

  it("falls back to the getter's own contextElement when no explicit one", () => {
    const point = new DOMRect(120, 80, 0, 0)
    const host = document.createElement("div")
    const anchor: RuneAnchor = () => point
    anchor.contextElement = host
    let value: { current: Element } | null | undefined

    render(
      <Probe
        getClientRect={anchor}
        onValue={(next) => {
          value = next
        }}
      />,
    )

    expect((value?.current as VirtualWithContext).contextElement).toBe(host)
  })

  it("prefers the explicit contextElement over the getter's own", () => {
    const point = new DOMRect(120, 80, 0, 0)
    const fromGetter = document.createElement("div")
    const explicit = document.createElement("section")
    const anchor: RuneAnchor = () => point
    anchor.contextElement = fromGetter
    let value: { current: Element } | null | undefined

    render(
      <Probe
        getClientRect={anchor}
        contextElement={explicit}
        onValue={(next) => {
          value = next
        }}
      />,
    )

    expect((value?.current as VirtualWithContext).contextElement).toBe(explicit)
  })

  it("leaves contextElement undefined when none is provided", () => {
    const point = new DOMRect(120, 80, 0, 0)
    let value: { current: Element } | null | undefined

    render(<Probe getClientRect={() => point} onValue={(next) => { value = next }} />)

    expect((value?.current as VirtualWithContext).contextElement).toBeUndefined()
  })

  it("exposes the resolved render-time rect so a caller can size off it without a second read", () => {
    const point = new DOMRect(40, 50, 320, 24)
    let value: ({ current: Element; rect?: DOMRect }) | null | undefined

    render(
      <Probe
        getClientRect={() => point}
        onValue={(next) => {
          value = next
        }}
      />,
    )

    // The same snapshot getBoundingClientRect would seed from — not a re-read.
    expect(value?.rect).toBe(point)
  })

  it("uses a newer rect after a later usable getter arrives", () => {
    const first = new DOMRect(10, 20, 30, 40)
    const second = new DOMRect(50, 60, 70, 80)
    const values: Array<{ current: Element } | null> = []

    const { rerender } = render(
      <Probe getClientRect={() => first} onValue={(next) => values.push(next)} />,
    )
    rerender(<Probe getClientRect={null} onValue={(next) => values.push(next)} />)
    rerender(<Probe getClientRect={() => second} onValue={(next) => values.push(next)} />)

    const latest = values.at(-1)
    expect(latest).not.toBeNull()
    expect(latest?.current.getBoundingClientRect()).toBe(second)
  })
})
