// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest"
import { findContainingBlock, viewportToCBLocal } from "./cb"

let root: HTMLDivElement

class TestDOMPoint {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
}

class TestDOMMatrix {
  private readonly a: number
  private readonly b: number
  private readonly c: number
  private readonly d: number
  private readonly e: number
  private readonly f: number

  constructor(transform = "none") {
    const values = parseTransform(transform)
    this.a = values.a
    this.b = values.b
    this.c = values.c
    this.d = values.d
    this.e = values.e
    this.f = values.f
  }

  inverse(): TestDOMMatrix {
    const det = this.a * this.d - this.b * this.c
    const inverse = Object.create(TestDOMMatrix.prototype) as TestDOMMatrix
    Object.assign(inverse, {
      a: this.d / det,
      b: -this.b / det,
      c: -this.c / det,
      d: this.a / det,
      e: (this.c * this.f - this.d * this.e) / det,
      f: (this.b * this.e - this.a * this.f) / det,
    })
    return inverse
  }

  transformPoint(point: TestDOMPoint): TestDOMPoint {
    return new TestDOMPoint(
      this.a * point.x + this.c * point.y + this.e,
      this.b * point.x + this.d * point.y + this.f,
    )
  }
}

function parseTransform(transform: string): {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
} {
  if (!transform || transform === "none") {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  }
  const scale = transform.match(/^scale\(([-\d.]+)\)$/)
  if (scale?.[1]) {
    const s = Number(scale[1])
    return { a: s, b: 0, c: 0, d: s, e: 0, f: 0 }
  }
  const matrix = transform.match(/^matrix\(([^)]+)\)$/)
  if (matrix?.[1]) {
    const values = matrix[1].split(",").map((v) => Number(v.trim()))
    if (values.length !== 6) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const [a, b, c, d, e, f] = values as [number, number, number, number, number, number]
    return { a, b, c, d, e, f }
  }
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

beforeAll(() => {
  vi.stubGlobal("DOMPoint", TestDOMPoint)
  vi.stubGlobal("DOMMatrix", TestDOMMatrix)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  root = document.createElement("div")
  document.body.appendChild(root)
})

afterEach(() => {
  root.remove()
})

describe("findContainingBlock", () => {
  it("returns null when no ancestor (and not el itself) creates a CB", () => {
    const el = document.createElement("div")
    root.appendChild(el)
    expect(findContainingBlock(el)).toBeNull()
  })

  it("returns el itself when el has transform (start-from-el regression)", () => {
    const el = document.createElement("div")
    el.style.transform = "translateZ(0)"
    root.appendChild(el)
    expect(findContainingBlock(el)).toBe(el)
  })

  it("returns ancestor with transform", () => {
    const ancestor = document.createElement("div")
    ancestor.style.transform = "scale(0.5)"
    const el = document.createElement("div")
    ancestor.appendChild(el)
    root.appendChild(ancestor)
    expect(findContainingBlock(el)).toBe(ancestor)
  })

  it("returns ancestor with filter", () => {
    const ancestor = document.createElement("div")
    ancestor.style.filter = "blur(0px)"
    const el = document.createElement("div")
    ancestor.appendChild(el)
    root.appendChild(ancestor)
    expect(findContainingBlock(el)).toBe(ancestor)
  })

  it("returns ancestor with perspective", () => {
    const ancestor = document.createElement("div")
    ancestor.style.perspective = "100px"
    const el = document.createElement("div")
    ancestor.appendChild(el)
    root.appendChild(ancestor)
    expect(findContainingBlock(el)).toBe(ancestor)
  })

  it("returns ancestor with contain: paint", () => {
    const ancestor = document.createElement("div")
    ancestor.style.contain = "paint"
    const el = document.createElement("div")
    ancestor.appendChild(el)
    root.appendChild(ancestor)
    expect(findContainingBlock(el)).toBe(ancestor)
  })

  it("returns ancestor with will-change: transform", () => {
    const ancestor = document.createElement("div")
    ancestor.style.willChange = "transform"
    const el = document.createElement("div")
    ancestor.appendChild(el)
    root.appendChild(ancestor)
    expect(findContainingBlock(el)).toBe(ancestor)
  })

  it("walks past static / relative ancestors to find the CB", () => {
    const cb = document.createElement("div")
    cb.style.transform = "translate(0,0)"
    const middle = document.createElement("div")
    middle.style.position = "relative"
    const el = document.createElement("div")
    middle.appendChild(el)
    cb.appendChild(middle)
    root.appendChild(cb)
    expect(findContainingBlock(el)).toBe(cb)
  })
})

describe("viewportToCBLocal", () => {
  it("identity when CB is null", () => {
    expect(viewportToCBLocal(null, 100, 50)).toEqual({ x: 100, y: 50 })
  })

  it("subtracts CB rect when CB has identity transform", () => {
    const cb = document.createElement("div")
    cb.getBoundingClientRect = () => ({
      left: 30, top: 20, right: 30, bottom: 20, width: 0, height: 0, x: 30, y: 20,
      toJSON: () => ({}),
    } as DOMRect)
    expect(viewportToCBLocal(cb, 100, 50)).toEqual({ x: 70, y: 30 })
  })

  it("inverts CB scale", () => {
    // CB has transform: scale(0.5); rect.left=10, rect.top=20.
    // A viewport point (60, 70) is offset (50, 50) into the visually-scaled CB.
    // Inverse maps that back to local (100, 100) — pre-scale.
    const cb = document.createElement("div")
    cb.style.transform = "scale(0.5)"
    cb.getBoundingClientRect = () => ({
      left: 10, top: 20, right: 0, bottom: 0, width: 0, height: 0, x: 10, y: 20,
      toJSON: () => ({}),
    } as DOMRect)
    const out = viewportToCBLocal(cb, 60, 70)
    expect(out.x).toBeCloseTo(100, 5)
    expect(out.y).toBeCloseTo(100, 5)
  })
})
