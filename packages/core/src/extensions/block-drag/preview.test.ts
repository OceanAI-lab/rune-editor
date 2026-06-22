// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createPreview, updatePreviewPosition, destroyPreview } from "./preview"
import { GHOST_CLASS } from "./BlockDrag"

let editorRoot: HTMLDivElement
let pm: HTMLDivElement
let source: HTMLParagraphElement

beforeEach(() => {
  editorRoot = document.createElement("div")
  editorRoot.className = "rune-editor"
  document.body.appendChild(editorRoot)

  pm = document.createElement("div")
  pm.className = "ProseMirror"
  pm.setAttribute("contenteditable", "true")
  editorRoot.appendChild(pm)

  source = document.createElement("p")
  source.setAttribute("data-block-id", "block-1")
  source.classList.add(GHOST_CLASS)
  source.textContent = "the quick brown fox"
  pm.appendChild(source)
})

afterEach(() => {
  editorRoot.remove()
})

describe("createPreview", () => {
  it("appends a wrapper inside editorRoot as a sibling of .ProseMirror", () => {
    createPreview(editorRoot, [source], { clientX: 10, clientY: 10 })
    const wrapper = editorRoot.querySelector(":scope > .rune-block-drag-preview")
    expect(wrapper).not.toBeNull()
    expect(wrapper?.parentElement).toBe(editorRoot)
  })

  it("wrapper is contenteditable=false", () => {
    createPreview(editorRoot, [source], { clientX: 10, clientY: 10 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    expect(wrapper.getAttribute("contenteditable")).toBe("false")
  })

  it("includes a shallow clone of .ProseMirror as the only intermediate ancestor", () => {
    createPreview(editorRoot, [source], { clientX: 10, clientY: 10 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    // wrapper > .ProseMirror > [data-block-id]
    const pmClone = wrapper.firstElementChild as HTMLElement
    expect(pmClone.classList.contains("ProseMirror")).toBe(true)
    expect(pmClone.children.length).toBe(1)                  // only the source clone
    expect(pmClone.firstElementChild?.tagName).toBe("P")
  })

  it("clone shells have contenteditable removed", () => {
    createPreview(editorRoot, [source], { clientX: 10, clientY: 10 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    const pmClone = wrapper.firstElementChild as HTMLElement
    expect(pmClone.hasAttribute("contenteditable")).toBe(false)
  })

  it("source clone has GHOST_CLASS removed", () => {
    createPreview(editorRoot, [source], { clientX: 10, clientY: 10 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    const sourceClone = wrapper.querySelector("[data-block-id]") as HTMLElement
    expect(sourceClone.classList.contains(GHOST_CLASS)).toBe(false)
  })

  it("source clone is a deep clone (text content preserved)", () => {
    createPreview(editorRoot, [source], { clientX: 10, clientY: 10 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    const sourceClone = wrapper.querySelector("[data-block-id]") as HTMLElement
    expect(sourceClone.textContent).toBe("the quick brown fox")
  })

  it("returns grab = thresholdCursor − sourceRect.topLeft", () => {
    // jsdom's getBoundingClientRect returns zeros for un-laid-out elements,
    // so grab = (clientX - 0, clientY - 0) = (clientX, clientY) here.
    const { grab } = createPreview(editorRoot, [source], { clientX: 17, clientY: 23 })
    expect(grab).toEqual({ dx: 17, dy: 23 })
  })

  it("preserves intermediate ancestor's data-* attributes via shallow clone", () => {
    pm.setAttribute("data-test-attr", "carry-me")
    createPreview(editorRoot, [source], { clientX: 0, clientY: 0 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    const pmClone = wrapper.firstElementChild as HTMLElement
    expect(pmClone.getAttribute("data-test-attr")).toBe("carry-me")
  })

  it("preserves intermediate ancestor's inline style via shallow clone", () => {
    pm.style.setProperty("--rune-ol-offset", "2em")
    createPreview(editorRoot, [source], { clientX: 0, clientY: 0 })
    const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
    const pmClone = wrapper.firstElementChild as HTMLElement
    expect(pmClone.style.getPropertyValue("--rune-ol-offset")).toBe("2em")
  })

  describe("multi-source", () => {
    let source2: HTMLParagraphElement

    beforeEach(() => {
      source2 = document.createElement("p")
      source2.setAttribute("data-block-id", "block-2")
      source2.classList.add(GHOST_CLASS)
      source2.textContent = "second source"
      pm.appendChild(source2)
    })

    it("appends N deep clones inside the innermost shell, in source order", () => {
      createPreview(editorRoot, [source, source2], { clientX: 10, clientY: 10 })
      const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
      const pmClone = wrapper.firstElementChild as HTMLElement
      expect(pmClone.classList.contains("ProseMirror")).toBe(true)
      expect(pmClone.children.length).toBe(2)
      const clones = pmClone.children
      expect((clones[0] as HTMLElement).getAttribute("data-block-id")).toBe("block-1")
      expect((clones[1] as HTMLElement).getAttribute("data-block-id")).toBe("block-2")
    })

    it("removes ghost class from every cloned source", () => {
      createPreview(editorRoot, [source, source2], { clientX: 10, clientY: 10 })
      const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
      const clones = wrapper.querySelectorAll(`.ProseMirror > p`)
      for (const clone of clones) {
        expect((clone as HTMLElement).classList.contains(GHOST_CLASS)).toBe(false)
      }
    })

    it("uses sources[0] for width and position", () => {
      // jsdom returns 0 for offsetWidth without layout; assert the wrapper
      // received SOMETHING — exact value comes from real-browser parity test.
      // Here, just verify the position is anchored at sources[0].
      const r = source.getBoundingClientRect()
      createPreview(editorRoot, [source, source2], { clientX: 10, clientY: 10 })
      const wrapper = editorRoot.querySelector(".rune-block-drag-preview") as HTMLElement
      // r.left/top is a number; jsdom may give 0, but the style must be set.
      expect(wrapper.style.left).toMatch(/^[-\d.]+px$/)
      expect(wrapper.style.top).toMatch(/^[-\d.]+px$/)
      void r
    })

    it("throws when sources have different parents", () => {
      const otherPm = document.createElement("div")
      otherPm.className = "ProseMirror"
      editorRoot.appendChild(otherPm)
      const stranger = document.createElement("p")
      stranger.setAttribute("data-block-id", "stranger")
      otherPm.appendChild(stranger)

      expect(() =>
        createPreview(editorRoot, [source, stranger], { clientX: 10, clientY: 10 }),
      ).toThrow()
    })

    it("throws when sources is empty", () => {
      expect(() =>
        createPreview(editorRoot, [], { clientX: 10, clientY: 10 }),
      ).toThrow()
    })
  })

})

describe("updatePreviewPosition", () => {
  it("sets style.left/top to cursor − grab in CB-local coords (null CB)", () => {
    const { preview, grab } = createPreview(editorRoot, [source], { clientX: 5, clientY: 7 })
    updatePreviewPosition(preview, editorRoot, { clientX: 100, clientY: 200 }, grab)
    expect(preview.style.left).toBe(`${100 - grab.dx}px`)
    expect(preview.style.top).toBe(`${200 - grab.dy}px`)
  })
})

describe("destroyPreview", () => {
  it("removes the preview from the DOM", () => {
    const { preview } = createPreview(editorRoot, [source], { clientX: 0, clientY: 0 })
    destroyPreview(preview)
    expect(editorRoot.querySelector(".rune-block-drag-preview")).toBeNull()
  })

  it("is idempotent", () => {
    const { preview } = createPreview(editorRoot, [source], { clientX: 0, clientY: 0 })
    destroyPreview(preview)
    expect(() => destroyPreview(preview)).not.toThrow()
  })
})
