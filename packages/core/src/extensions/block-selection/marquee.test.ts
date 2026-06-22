// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Plugin } from "@tiptap/pm/state"
import { Paragraph, Heading } from "../../blocks"
import { BlockId } from "../block-id"
import { BlockSelection, MultiBlockSelection } from "./index"
import { setMarqueeZone, blockSelectionMarqueePlugin } from "./marquee"
import { gestureKey, GestureStatePlugin } from "../shared/gesture-state"

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
  if (typeof document.elementFromPoint !== "function") {
    ;(document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => null
  }
})

afterEach(() => {
  document.querySelectorAll(".rune-marquee").forEach((el) => el.remove())
  container.remove()
  vi.restoreAllMocks()
})

function makeEditor() {
  // `.rune-editor` is the default marquee zone (auto-installed by the
  // plugin's view()); container has that class via beforeEach. No
  // explicit setMarqueeZone needed — that's the host-opt-in extension
  // for wider zones, covered by its own tests.
  return new Editor({
    element: container,
    extensions: [Document, Text, Paragraph, Heading, BlockId, BlockSelection],
    content: "<p>Block 1</p><p>Block 2</p><p>Block 3</p><p>Block 4</p>",
  })
}

function setBlockRects() {
  const blocks = container.querySelectorAll(".rune-block")
  blocks.forEach((block, i) => {
    const rect = {
      top: 20 + i * 40,
      bottom: 50 + i * 40,
      left: 100,
      right: 300,
      width: 200,
      height: 30,
      x: 100,
      y: 20 + i * 40,
      toJSON: () => ({}),
    } as DOMRect
    ;(block as HTMLElement).getBoundingClientRect = () => rect
    const content = block.querySelector(".rune-block-content") as HTMLElement | null
    if (content) content.getBoundingClientRect = () => rect
  })
}

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

describe("marquee selection", () => {
  it("starts from .rune-editor padding outside any block", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 5 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 140 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 140 }))
    editor.destroy()
  })

  it("does not start when mousedown lands inside .rune-block (e.g. horizontal whitespace right of short text)", async () => {
    const editor = makeEditor()
    setBlockRects()
    const block = container.querySelector(".rune-block")
    expect(block).not.toBeNull()

    block!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 25 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 140 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    editor.destroy()
  })

  it("does not start when mousedown lands inside .rune-block-content", async () => {
    const editor = makeEditor()
    setBlockRects()
    const content = container.querySelector(".rune-block-content")
    expect(content).not.toBeNull()

    content!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 120, clientY: 25 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 320, clientY: 140 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    editor.destroy()
  })

  it("clears the native selection when marquee starts so a stale TextSelection cannot bleed through", async () => {
    const editor = makeEditor()
    setBlockRects()

    // Pre-existing native range from a prior text selection in another block.
    const range = document.createRange()
    const textNode = container.querySelector("p")?.firstChild
    if (textNode) {
      range.setStart(textNode, 0)
      range.setEnd(textNode, Math.min(3, textNode.nodeValue?.length ?? 0))
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    expect(window.getSelection()?.rangeCount).toBeGreaterThan(0)

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    // Native range must be cleared so it doesn't visually conflict with MBS.
    expect(window.getSelection()?.rangeCount ?? 0).toBe(0)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    editor.destroy()
  })

  it("registers a selectstart guard while marquee is active and removes it on mouseup", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    // selectstart must be cancelled while gesture is live.
    const guarded = new Event("selectstart", { bubbles: true, cancelable: true })
    document.dispatchEvent(guarded)
    expect(guarded.defaultPrevented).toBe(true)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))

    // After mouseup, guard must be detached.
    const afterUp = new Event("selectstart", { bubbles: true, cancelable: true })
    document.dispatchEvent(afterUp)
    expect(afterUp.defaultPrevented).toBe(false)

    editor.destroy()
  })

  it("ignores a non-primary mouseup mid-marquee (right release must not end the gesture)", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()
    expect(document.querySelector(".rune-marquee")).not.toBeNull()
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)

    // Right-button release while the primary is still held — the gesture
    // must stay live with its overlay and selection intact.
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2, buttons: 1, clientX: 120, clientY: 135 }))
    expect(document.querySelector(".rune-marquee")).not.toBeNull()
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)

    // The primary release still ends it normally.
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    expect(document.querySelector(".rune-marquee")).toBeNull()

    editor.destroy()
  })

  it("pure click without mousemove does not preventDefault and creates no overlay", async () => {
    const editor = makeEditor()
    setBlockRects()

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 320, clientY: 5 })
    container.dispatchEvent(event)
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 320, clientY: 5 }))

    expect(event.defaultPrevented).toBe(false)
    expect(document.querySelector(".rune-marquee")).toBeNull()

    editor.destroy()
  })

  it("starts from .rune-editor padding (outside any block) and removes overlay on mouseup", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 20 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 320, clientY: 140 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 320, clientY: 140 }))
    expect(document.querySelector(".rune-marquee")).toBeNull()

    editor.destroy()
  })

  it("ignores mousedown from a nested child editor wrapper", async () => {
    const editor = makeEditor()
    setBlockRects()
    // Nested .rune-editor inside the outer .rune-editor — same shape as
    // a child editor mounted within outer chrome (e.g. a comment thread
    // or popover that hosts its own RuneEditor). The bubble reaches the
    // outer listener but isMarqueeEligibleTarget rejects because
    // target.closest('.rune-editor') resolves to the child, not the outer.
    const childEditor = document.createElement("div")
    childEditor.className = "rune-editor"
    container.appendChild(childEditor)

    childEditor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 300, clientY: 100 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    editor.destroy()
  })

  it("dispatches contiguous MBS over intersected blocks", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    editor.destroy()
  })

  it("coalesces sparse intersections to one contiguous MBS range", async () => {
    const editor = makeEditor()
    const blocks = container.querySelectorAll(".rune-block")
    ;(blocks[0] as HTMLElement).getBoundingClientRect = () =>
      ({ top: 20, bottom: 50, left: 100, right: 300, width: 200, height: 30, x: 100, y: 20, toJSON: () => ({}) }) as DOMRect
    ;(blocks[1] as HTMLElement).getBoundingClientRect = () =>
      ({ top: 100, bottom: 130, left: 500, right: 700, width: 200, height: 30, x: 500, y: 100, toJSON: () => ({}) }) as DOMRect
    ;(blocks[2] as HTMLElement).getBoundingClientRect = () =>
      ({ top: 160, bottom: 190, left: 100, right: 300, width: 200, height: 30, x: 100, y: 160, toJSON: () => ({}) }) as DOMRect
    ;(blocks[3] as HTMLElement).getBoundingClientRect = () =>
      ({ top: 220, bottom: 250, left: 500, right: 700, width: 200, height: 30, x: 500, y: 220, toJSON: () => ({}) }) as DOMRect

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 90, clientY: 10 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 310, clientY: 200 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 310, clientY: 200 }))
    editor.destroy()
  })

  it("leaves existing selection unchanged when marquee intersects no blocks", async () => {
    const editor = makeEditor()
    setBlockRects()
    editor.commands.setTextSelection(2)
    const before = editor.state.selection

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 50, clientY: 300 }))
    await nextFrame()
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 50, clientY: 300 }))

    expect(editor.state.selection).toBe(before)
    editor.destroy()
  })

  it("preserves reverse drag direction by anchoring the high edge", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 135 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 55 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])
    expect((editor.state.selection as MultiBlockSelection).isForward).toBe(false)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 55 }))
    editor.destroy()
  })

  it("does not dispatch again when rAF sees the same marquee range", async () => {
    const editor = makeEditor()
    setBlockRects()
    const dispatch = vi.spyOn(editor.view, "dispatch")

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()
    const afterFirstRange = dispatch.mock.calls.length

    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(dispatch.mock.calls.length).toBe(afterFirstRange)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    editor.destroy()
  })

  it("re-evaluates marquee selection on document scroll without a new mousemove", async () => {
    const editor = makeEditor()
    setBlockRects()
    const block = container.querySelector(".rune-block") as HTMLElement
    const originalRect = block.getBoundingClientRect.bind(block)
    const readRect = vi.fn(() => originalRect())
    block.getBoundingClientRect = readRect

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 5 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 60 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)
    const initialSel = editor.state.selection
    expect(initialSel).toBeInstanceOf(MultiBlockSelection)
    readRect.mockClear()

    // Simulate the page scrolling down 200px: window.scrollY moves and the
    // viewport-relative block rects (mocked by setBlockRects) stay where
    // they were. With scroll compensation, the projected `start.y` shifts
    // up by 200 when the scroll event schedules a new tick.
    Object.defineProperty(window, "scrollY", { configurable: true, value: 200 })
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 })

    document.dispatchEvent(new Event("scroll", { bubbles: true }))
    await nextFrame()

    // The assertion is "scroll caused a re-evaluation" not a specific range,
    // since exact selected indices depend on mocked geometry.
    expect(readRect).toHaveBeenCalled()

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 60 }))
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 })
    editor.destroy()
  })

  it("compensates marquee selection for element scroll owners", async () => {
    const editor = makeEditor()
    setBlockRects()
    container.style.overflowY = "auto"
    Object.defineProperty(container, "scrollTop", { configurable: true, writable: true, value: 0 })
    Object.defineProperty(container, "scrollLeft", { configurable: true, writable: true, value: 0 })
    container.getBoundingClientRect = () =>
      ({ top: 0, bottom: 400, left: 0, right: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])

    container.scrollTop = 80
    container.dispatchEvent(new Event("scroll"))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    editor.destroy()
  })

  it("projects horizontal window scroll into the marquee start point", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    const overlay = document.querySelector(".rune-marquee") as HTMLElement | null
    expect(overlay).toBeInstanceOf(HTMLElement)
    expect(overlay!.style.width).toBe("200px")

    Object.defineProperty(window, "scrollX", { configurable: true, value: 100 })
    document.dispatchEvent(new Event("scroll", { bubbles: true }))
    await nextFrame()

    expect(overlay!.style.width).toBe("100px")

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 })
    editor.destroy()
  })

  it("Escape cancels marquee and removes overlay without changing selection afterward", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 20 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 100 }))
    await nextFrame()
    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    expect(document.querySelector(".rune-marquee")).toBeNull()

    const before = editor.state.selection
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 180 }))
    await nextFrame()
    expect(editor.state.selection).toBe(before)

    editor.destroy()
  })

  it("autoscrolls down from the editor scroll owner while cursor rests near the lower viewport edge", async () => {
    const editor = makeEditor()
    setBlockRects()
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 120 })
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined)

    try {
      container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 20 }))
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 118 }))
      await nextFrame()
      await nextFrame()

      const dys = scrollBy.mock.calls.map((call) => call[1] as number)
      expect(dys.some((dy) => dy > 0)).toBe(true)
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight })
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 118 }))
      editor.destroy()
    }
  })

  it("setMarqueeZone called before plugin attaches is replayed once the attacher registers", () => {
    // Drive the real "attacher not yet registered" state: construct an
    // editor without the marquee plugin, capture its view, call
    // setMarqueeZone (lands in pendingZones), then registerPlugin the
    // marquee plugin on the same view — PM runs the new plugin's view()
    // on the existing view, which is where the replay happens.
    const localContainer = document.createElement("div")
    localContainer.className = "rune-editor"
    document.body.appendChild(localContainer)
    const editor = new Editor({
      element: localContainer,
      extensions: [Document, Text, Paragraph, BlockId],
      content: "<p>x</p>",
    })

    const zone = document.createElement("div")
    document.body.appendChild(zone)
    const dispose = setMarqueeZone(editor, zone)

    // Pending: no DOM mutation yet. If the replay logic were absent,
    // this attribute would never appear and dispose would never have a
    // live registration to tear down.
    expect(zone.hasAttribute("data-rune-marquee-zone")).toBe(false)

    editor.registerPlugin(blockSelectionMarqueePlugin())

    // Replay: attribute is stamped and the disposer now owns a live
    // teardown path. Both halves are observable from public API.
    expect(zone.hasAttribute("data-rune-marquee-zone")).toBe(true)

    dispose()
    expect(zone.hasAttribute("data-rune-marquee-zone")).toBe(false)

    zone.remove()
    editor.destroy()
    localContainer.remove()
  })

  it("host zone survives a subsequent registerPlugin reconfigure", async () => {
    // Real downstream shape: host wraps editor in <RuneMarqueeZone>,
    // then separately calls editor.registerPlugin(...) to install
    // something unrelated (e.g. a wiki-link decoration plugin reactive
    // to host data). Tiptap's registerPlugin reconfigures EditorState,
    // which makes PM destroy and re-init ALL plugin views — including
    // marquee's. The host zone must survive that, otherwise marquee
    // silently degrades back to the default `.rune-editor` zone (or
    // dies entirely if the host never had `.rune-editor` covered by
    // the wider wrapper).
    const pageWrap = document.createElement("div")
    document.body.appendChild(pageWrap)
    pageWrap.appendChild(container)

    const editor = makeEditor()
    const dispose = setMarqueeZone(editor, pageWrap)
    setBlockRects()

    expect(pageWrap.hasAttribute("data-rune-marquee-zone")).toBe(true)

    // Host installs an unrelated plugin — Tiptap → PM reconfigures →
    // every plugin view (incl. marquee) gets destroyed and re-instantiated.
    editor.registerPlugin(new Plugin({}))

    // The host's intent should outlive the plugin lifecycle event.
    expect(pageWrap.hasAttribute("data-rune-marquee-zone")).toBe(true)

    // And the mousedown listener on pageWrap should still wire marquee:
    // a drag from the host wrapper area must still start marquee.
    pageWrap.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    dispose()
    editor.destroy()
    document.body.appendChild(container)
    pageWrap.remove()
  })

  it("auto-installs .rune-editor as default zone without setMarqueeZone", () => {
    const editor = makeEditor()
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(true)
    editor.destroy()
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(false)
  })

  it("setMarqueeZone(editor, hostEl) overrides default; disposer reverts to default", () => {
    const editor = makeEditor()
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(true)

    const host = document.createElement("div")
    document.body.appendChild(host)
    const dispose = setMarqueeZone(editor, host)

    expect(host.hasAttribute("data-rune-marquee-zone")).toBe(true)
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(false)

    dispose()

    expect(host.hasAttribute("data-rune-marquee-zone")).toBe(false)
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(true)

    host.remove()
    editor.destroy()
  })

  it("host zone as editor ancestor — drag from outside .rune-editor triggers marquee", async () => {
    // Real downstream shape: a page wrapper (host's grid / gutter
    // layout) contains `.rune-editor` plus title rows etc. Wrapping
    // the page in <RuneMarqueeZone> registers the page as the zone, so
    // a drag starting OUTSIDE `.rune-editor` (in a gutter cell) still
    // dispatches MBS.
    const pageWrap = document.createElement("div")
    document.body.appendChild(pageWrap)
    pageWrap.appendChild(container) // re-parent into pageWrap

    const editor = makeEditor()
    const dispose = setMarqueeZone(editor, pageWrap)
    setBlockRects()

    // Mousedown lands on the page wrapper itself — outside `.rune-editor`
    // but inside the host zone. Bubbling reaches the listener attached
    // to pageWrap.
    pageWrap.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    dispose()
    editor.destroy()
    // Restore container to document.body for afterEach.
    document.body.appendChild(container)
    pageWrap.remove()
  })

  it("host zone sibling row — drag from page title element triggers marquee", async () => {
    // Notion-style page shells put title / cover / controls as siblings
    // of the editor body inside the same host zone. Those siblings are
    // intentional marquee territory unless explicitly marked as chrome.
    const pageWrap = document.createElement("div")
    const title = document.createElement("h1")
    title.className = "playground-page-title"
    pageWrap.append(title, container)
    document.body.appendChild(pageWrap)

    const editor = makeEditor()
    const dispose = setMarqueeZone(editor, pageWrap)
    setBlockRects()

    title.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    dispose()
    editor.destroy()
    document.body.appendChild(container)
    pageWrap.remove()
  })

  it("host zone chrome marked data-rune-marquee-skip does not trigger marquee", async () => {
    const pageWrap = document.createElement("div")
    const toolbar = document.createElement("div")
    toolbar.setAttribute("data-rune-marquee-skip", "")
    pageWrap.append(toolbar, container)
    document.body.appendChild(pageWrap)

    const editor = makeEditor()
    const dispose = setMarqueeZone(editor, pageWrap)
    setBlockRects()

    toolbar.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    dispose()
    editor.destroy()
    document.body.appendChild(container)
    pageWrap.remove()
  })

  it("setMarqueeZone(editor, null) reverts to default .rune-editor zone", () => {
    const editor = makeEditor()
    const host = document.createElement("div")
    document.body.appendChild(host)
    setMarqueeZone(editor, host)
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(false)

    setMarqueeZone(editor, null)

    expect(host.hasAttribute("data-rune-marquee-zone")).toBe(false)
    expect(container.hasAttribute("data-rune-marquee-zone")).toBe(true)

    host.remove()
    editor.destroy()
  })

  it("readonly editor does not fire marquee from default zone", async () => {
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph, Heading, BlockId, BlockSelection],
      content: "<p>Block 1</p><p>Block 2</p>",
      editable: false,
    })
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 5 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 60 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 60 }))
    editor.destroy()
  })

  it("setMarqueeZone called twice before attacher only replays the latest element", () => {
    // Newer pending must supersede older — caller's intent is the last
    // call wins, and the older disposer must become a no-op.
    const localContainer = document.createElement("div")
    localContainer.className = "rune-editor"
    document.body.appendChild(localContainer)
    const editor = new Editor({
      element: localContainer,
      extensions: [Document, Text, Paragraph, BlockId],
      content: "<p>x</p>",
    })

    const zoneA = document.createElement("div")
    const zoneB = document.createElement("div")
    document.body.append(zoneA, zoneB)
    const disposeA = setMarqueeZone(editor, zoneA)
    const disposeB = setMarqueeZone(editor, zoneB)

    editor.registerPlugin(blockSelectionMarqueePlugin())

    expect(zoneA.hasAttribute("data-rune-marquee-zone")).toBe(false)
    expect(zoneB.hasAttribute("data-rune-marquee-zone")).toBe(true)

    // The stale disposer must not pull the rug out from under B.
    disposeA()
    expect(zoneB.hasAttribute("data-rune-marquee-zone")).toBe(true)

    disposeB()
    expect(zoneB.hasAttribute("data-rune-marquee-zone")).toBe(false)

    zoneA.remove()
    zoneB.remove()
    editor.destroy()
    localContainer.remove()
  })

  it("window blur while armed clears the armed state; the next marquee anchors at its own mousedown (#297)", async () => {
    const editor = makeEditor()
    setBlockRects()

    // Arm in the padding below every block — mousedown with NO mouseup
    // (the exact stream a browser delivers when alt-tab eats the mouseup).
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 200 }))
    window.dispatchEvent(new Event("blur"))

    // A later, completely normal marquee over blocks 1-2. Without the
    // armed-stage cancel registration, the re-entry guard swallows this
    // mousedown and the stale onMove promotes from the OLD anchor
    // (y=200), selecting the wrong block range ([3, 3]).
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    editor.destroy()
  })

  it("Escape while armed clears the armed state without a promotion (#297)", async () => {
    const editor = makeEditor()
    setBlockRects()
    const before = editor.state.selection

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 200 }))
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))

    // The (now stale) move stream must not promote a marquee.
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).toBe(before)

    editor.destroy()
  })

  it("a buttons:0 mousemove while armed cancels instead of promoting from the stale anchor (#297)", async () => {
    const editor = makeEditor()
    setBlockRects()

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 200 }))
    // The mouseup AND the blur were both lost — what arrives next is a
    // plain hover move with no button held.
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    // The pipeline is healthy afterward: a fresh marquee works normally.
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([1, 2])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 135 }))
    editor.destroy()
  })

  it("autoscrolls up from the editor scroll owner while cursor rests near the upper viewport edge", async () => {
    const editor = makeEditor()
    setBlockRects()
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined)

    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 80 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 2 }))
    await nextFrame()
    await nextFrame()

    const dys = scrollBy.mock.calls.map((call) => call[1] as number)
    expect(dys.some((dy) => dy < 0)).toBe(true)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 120, clientY: 2 }))
    editor.destroy()
  })

  // GS-6 probe: claim refused at first move (another gesture owns the registry)
  // → marquee must run full clear() instead of silently continuing as an
  // unclaimed marquee. GS-6 regression guard: a refused claim must fully
  // disarm, not silently return and arm a phantom gesture.
  it("GS-6: refused registry claim at first move disarms marquee (no MBS, no overlay on further moves)", async () => {
    // Include GestureStatePlugin so gestureKey is registered in the PM state.
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph, Heading, BlockId, GestureStatePlugin, BlockSelection],
      content: "<p>Block 1</p><p>Block 2</p><p>Block 3</p><p>Block 4</p>",
    })
    setBlockRects()

    // Pre-claim the registry as another gesture ("block-drag"), simulating the
    // scenario where a parallel gesture already owns it when marquee tries to
    // claim at its first-move promotion point.
    editor.view.dispatch(
      editor.view.state.tr.setMeta(gestureKey, { activeGesture: "block-drag" }),
    )
    expect(gestureKey.getState(editor.view.state)?.activeGesture).toBe("block-drag")

    // Arm the marquee (mousedown on editor padding outside any block).
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 5 }))

    // First move — marquee promotion point; claimGesture should return null
    // (refused) and the gesture must run clear() immediately.
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 100 }))
    await nextFrame()

    // No overlay must exist (clear() removes it if created, and shouldn't
    // even create it on a refused claim).
    expect(document.querySelector(".rune-marquee")).toBeNull()
    // No MBS must have been dispatched.
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    // Registry must still show "block-drag" — marquee must NOT have wiped it.
    expect(gestureKey.getState(editor.view.state)?.activeGesture).toBe("block-drag")

    // Further moves must not dispatch anything (listeners must be gone).
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 140 }))
    await nextFrame()
    expect(document.querySelector(".rune-marquee")).toBeNull()
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    // Release the pre-claimed registry and clean up.
    editor.view.dispatch(
      editor.view.state.tr.setMeta(gestureKey, { activeGesture: null }),
    )
    editor.destroy()
  })

  // AV-2 / editable-flip abort probe: setEditable(false) mid-marquee →
  // next mousemove must end the gesture via clear(); selection already
  // dispatched stays (no suppression). Listeners must be gone afterward.
  it("editable-flip mid-marquee: setEditable(false) on next move ends gesture, leaving existing selection", async () => {
    // Include GestureStatePlugin so gestureKey is registered in the PM state
    // (needed so the registry release assertion is verifiable).
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph, Heading, BlockId, GestureStatePlugin, BlockSelection],
      content: "<p>Block 1</p><p>Block 2</p><p>Block 3</p><p>Block 4</p>",
    })
    setBlockRects()

    // Arm and promote the marquee — dispatch an initial MBS over blocks 1–2.
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 320, clientY: 55 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 135 }))
    await nextFrame()

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    const selBeforeFlip = editor.state.selection

    // Overlay must be present (gesture is active).
    expect(document.querySelector(".rune-marquee")).toBeInstanceOf(HTMLElement)

    // Flip the editor to read-only mid-gesture.
    editor.setEditable(false)

    // Next mousemove — the editable-flip abort path must fire clear().
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 175 }))
    await nextFrame()

    // Overlay must be gone (clear() ran).
    expect(document.querySelector(".rune-marquee")).toBeNull()
    // The selection that was already dispatched must still be there
    // (editable-flip abort = end early, leave selection — AV-3 is out of scope).
    expect(editor.state.selection).toBe(selBeforeFlip)
    // Registry must be released.
    expect(gestureKey.getState(editor.view.state)?.activeGesture).toBeNull()

    // Further moves must not dispatch anything (listeners must be gone).
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 120, clientY: 200 }))
    await nextFrame()
    expect(editor.state.selection).toBe(selBeforeFlip)

    editor.destroy()
  })
})
