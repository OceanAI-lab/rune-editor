// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { TextSelection } from "@tiptap/pm/state"
import { Paragraph, Heading } from "../../blocks"
import { BlockId } from "../block-id"
import { BlockSelection, blockSelectionKey, MultiBlockSelection } from "./index"
import { setMarqueeZone } from "./marquee"
import { getCrossBlockTextRange } from "./test-utils"
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
  container.remove()
})

function makeEditor() {
  return new Editor({
    element: container,
    extensions: [Document, Text, Paragraph, Heading, BlockId, BlockSelection],
    content: "<p>Block 1</p><p>Block 2</p><p>Block 3</p><p>Block 4</p>",
  })
}

describe("drag-extend — entry A", () => {
  it("same-block drag stays TextSelection and never promotes to MBS", () => {
    const editor = makeEditor()
    const firstText = container.querySelector(".rune-block-content p") as HTMLElement
    firstText.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 20 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 40, clientY: 22 }))
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 40, clientY: 22 }))
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    expect(blockSelectionKey.getState(editor.state)?.anchorBlockId).toBeNull()
    editor.destroy()
  })

  it("cross-block drag stays as TextSelection spanning blocks (no auto-promote)", () => {
    const editor = makeEditor()
    const blocks = container.querySelectorAll(".rune-block")
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      ({ top }) => (top < 60 ? { pos: 2, inside: 0 } : { pos: editor.state.doc.child(0).nodeSize + 2, inside: editor.state.doc.child(0).nodeSize })

    const firstText = blocks[0]!.querySelector(".rune-block-content p") as HTMLElement
    firstText.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 20 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 20, clientY: 80 }))

    // jsdom does not synthesize a native browser text-selection from mousemove,
    // so simulate what DOMObserver would flush in a real browser: a TextSelection
    // whose endpoints sit in different top-level blocks. After T4 removed
    // auto-promote, drag-extend must leave this alone (no MBS reclaim).
    const doc = editor.state.doc
    const fromPos = 1 // inside block 0
    const toPos = doc.child(0).nodeSize + 2 // inside block 1
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, fromPos, toPos)))

    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    expect(getCrossBlockTextRange(editor.state.selection)).toEqual({ fromIdx: 0, toIdx: 1 })

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 20, clientY: 80 }))
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    expect(getCrossBlockTextRange(editor.state.selection)).toEqual({ fromIdx: 0, toIdx: 1 })
    editor.destroy()
  })
})

describe("drag-extend — entry B", () => {
  it("yields to marquee on editor empty-area mousedown (default zone owns padding)", () => {
    // Post-Option-3 ownership division: `.rune-editor` / `.ProseMirror`
    // empty-area padding belongs to marquee; entry B keeps in-block
    // vertical padding. isMarqueeEligibleTarget returns true here, so
    // entry B yields and never arms its pending state.
    const editor = makeEditor()
    const outer = container.querySelector(".ProseMirror") as HTMLElement | null
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: editor.state.doc.child(0).nodeSize + 2, inside: editor.state.doc.child(0).nodeSize })

    ;(outer ?? container).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 80 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 2, clientY: 120 }))

    // Marquee doesn't dispatch either (no block rects mocked), so the
    // selection stays as the editor's initial TextSelection — i.e.,
    // entry B did not claim this gesture.
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 120 }))
    editor.destroy()
  })

  it("yields to marquee when a host zone is registered: editor padding mousedown does not dispatch block-mode MBS", () => {
    const editorEl = document.createElement("div")
    editorEl.className = "rune-editor"
    document.body.appendChild(editorEl)
    try {
      const editor = new Editor({
        element: editorEl,
        extensions: [Document, Text, Paragraph, Heading, BlockId, BlockSelection],
        content: "<p>Block 1</p><p>Block 2</p>",
      })
      // Host opts in: marquee zone === editor wrapper. Without this,
      // entry B owns padding; with it, drag-extend yields.
      setMarqueeZone(editor, editorEl)
      ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
        () => ({ pos: editor.state.doc.child(0).nodeSize + 2, inside: editor.state.doc.child(0).nodeSize })

      // Mousedown on .rune-editor itself (editor padding outside all
      // blocks) — marquee-eligible, so drag-extend must yield.
      editorEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 80 }))

      expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 80 }))
      editor.destroy()
    } finally {
      editorEl.remove()
    }
  })

  it("does not enter block mode from in-block horizontal whitespace", () => {
    const editor = makeEditor()
    const block = container.querySelector(".rune-block") as HTMLElement
    const content = block.querySelector(".rune-block-content") as HTMLElement
    expect(block).not.toBeNull()
    expect(content).not.toBeNull()
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: 2, inside: 0 })
    block.getBoundingClientRect = () =>
      ({ top: 0, bottom: 60, left: 0, right: 240, width: 240, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    content.getBoundingClientRect = () =>
      ({ top: 20, bottom: 40, left: 0, right: 80, width: 80, height: 20, x: 0, y: 20, toJSON: () => ({}) }) as DOMRect

    block.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 30 }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 200, clientY: 80 }))

    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 200, clientY: 80 }))
    editor.destroy()
  })
})

describe("drag-extend — dispatch cleanup", () => {
  it("every MBS dispatch stops the DOMObserver, clears the selection, dispatches, then restarts (in order)", () => {
    const editor = makeEditor()
    const stops: string[] = []
    const domObserver = (editor.view as unknown as { domObserver: { stop(): void; start(): void } }).domObserver
    // Wrap (don't replace) so PM's actual stop/start still runs — otherwise
    // the real MutationObserver stays connected and processing PM's own DOM
    // updates spirals into a microtask loop.
    const realStop = domObserver.stop.bind(domObserver)
    const realStart = domObserver.start.bind(domObserver)
    const stopSpy = vi.spyOn(domObserver, "stop").mockImplementation(() => {
      stops.push("stop"); realStop()
    })
    const startSpy = vi.spyOn(domObserver, "start").mockImplementation(() => {
      stops.push("start"); realStart()
    })
    const realSelection = window.getSelection()
    const removeAllRanges = vi.fn(() => { stops.push("clear"); realSelection?.removeAllRanges() })
    vi.spyOn(window, "getSelection").mockReturnValue({ removeAllRanges } as unknown as Selection)

    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => ({ pos: editor.state.doc.child(0).nodeSize + 2, inside: editor.state.doc.child(0).nodeSize })

    // In-block vertical padding mousedown (#41-B) — the only path
    // still owned by entry B after Option 3 (`.rune-editor` /
    // `.ProseMirror` empty-area belongs to marquee). The mousedown
    // target is a `.rune-block` element with Y outside its content's
    // vertical extent — entry B fires immediately.
    const block = container.querySelectorAll(".rune-block")[1] as HTMLElement
    const content = block.querySelector(".rune-block-content") as HTMLElement
    block.getBoundingClientRect = () =>
      ({ top: 60, bottom: 120, left: 0, right: 240, width: 240, height: 60, x: 0, y: 60, toJSON: () => ({}) }) as DOMRect
    content.getBoundingClientRect = () =>
      ({ top: 80, bottom: 100, left: 0, right: 80, width: 80, height: 20, x: 0, y: 80, toJSON: () => ({}) }) as DOMRect

    block.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 70 }))

    expect(stopSpy).toHaveBeenCalled()
    expect(removeAllRanges).toHaveBeenCalled()
    expect(startSpy).toHaveBeenCalled()
    // The dance must run: drag-extend stops the observer, clears the native
    // selection, dispatches, then restarts — so the trace must contain
    //   stop ... clear ... start
    // in that relative order. (PM may interleave its own stop/start during
    // dispatch, so we don't assert the exact subsequence beyond ordering.)
    const firstStop = stops.indexOf("stop")
    const firstClear = stops.indexOf("clear")
    const firstStart = stops.indexOf("start")
    expect(firstStop).toBeGreaterThanOrEqual(0)
    expect(firstClear).toBeGreaterThan(firstStop)
    expect(firstStart).toBeGreaterThan(firstClear)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 80 }))
    editor.destroy()
  })
})

describe("drag-extend — cancellation", () => {
  it("Escape cancels pending drag and removes document listeners", () => {
    const editor = makeEditor()
    const firstText = container.querySelector(".rune-block-content p") as HTMLElement
    firstText.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 20 }))
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 20, clientY: 80 }))
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
    editor.destroy()
  })
})

describe("drag-extend — auto-scroll", () => {
  it("active drag starts and stops one rAF loop; cleanup cancels it", () => {
    // jsdom innerHeight defaults to 768; force smaller for band check (768-500=268 > band=40)
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 520 })
    try {
      const editor = makeEditor()
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
        return window.setTimeout(() => cb(0), 0) as unknown as number
      })
      const caf = vi.spyOn(window, "cancelAnimationFrame")

      ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
        ({ top }) => (top < 60 ? { pos: 2, inside: 0 } : { pos: editor.state.doc.child(0).nodeSize + 2, inside: editor.state.doc.child(0).nodeSize })

      const firstText = container.querySelector(".rune-block-content p") as HTMLElement
      firstText.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 20 }))
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 20, clientY: 500 }))
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 20, clientY: 500 }))

      expect(raf).toHaveBeenCalled()
      expect(caf).toHaveBeenCalled()
      editor.destroy()
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight })
    }
  })
})

describe("drag-extend — primary-button gating (#297)", () => {
  // Geometry mirrors "in-block padding mousedown on a block OUTSIDE current
  // MBS still dispatches via entry B" below — same entry point, non-primary
  // button. Right presses are context-menu gestures: entry B must fall
  // through untouched (no MBS dispatch, no pending state, no listeners).
  function mockBlockRects() {
    const blocks = container.querySelectorAll(".rune-block")
    blocks.forEach((b, i) => {
      ;(b as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: i * 30, toJSON: () => ({}) }) as DOMRect
      const content = (b as HTMLElement).querySelector(".rune-block-content") as HTMLElement | null
      if (content) {
        content.getBoundingClientRect = () =>
          ({ top: i * 30 + 8, bottom: i * 30 + 12, left: 0, right: 60, width: 60, height: 4, x: 0, y: i * 30 + 8, toJSON: () => ({}) }) as DOMRect
      }
    })
    return blocks
  }

  it("right-button press in an unselected block's padding does not dispatch an MBS", () => {
    const editor = makeEditor()
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null
    const blocks = mockBlockRects()

    // Block 0's top padding (in-block, above content) — the exact spot
    // where a LEFT press dispatches a single-block MBS at mousedown.
    const block0 = blocks[0] as HTMLElement
    block0.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 2, buttons: 2, clientX: 2, clientY: 2 }),
    )

    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2, clientX: 2, clientY: 2 }))
    editor.destroy()
  })

  it("right-button press+drag in an unselected block's padding leaves an existing MBS untouched", () => {
    const editor = makeEditor()
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null
    const blocks = mockBlockRects()

    editor.commands.setBlockSelection({ from: 0, to: 1 })
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    const before = editor.state.selection

    // Right press in block 3's padding (NOT covered by the MBS, so the
    // coversSurfaceBlock yield can't mask a missing button gate), then a
    // drag down toward block 3's content row.
    const block3 = blocks[3] as HTMLElement
    block3.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 2, buttons: 2, clientX: 2, clientY: 92 }),
    )
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 2, clientX: 2, clientY: 100 }))

    // The gesture never armed: selection is the SAME object, not a
    // re-dispatched equal range.
    expect(editor.state.selection).toBe(before)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2, clientX: 2, clientY: 100 }))
    editor.destroy()
  })

  it("a buttons:0 mousemove mid block-mode gesture cancels instead of chasing the cursor (#297)", () => {
    const editor = makeEditor()
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null
    const blocks = mockBlockRects()

    // Left press in block 0's padding — entry B dispatches a single-block
    // MBS at mousedown and arms the document move/up listeners.
    const block0 = blocks[0] as HTMLElement
    block0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 2 }))
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    // Lost mouseup: the next move arrives with no buttons pressed (the
    // release happened where we couldn't see it — alt-tab, OS dialog —
    // and the matching blur was missed too). The gesture must cancel:
    // no extension toward block 2, and no preventDefault suppressing
    // native selection on a button-less move.
    const lostMove = new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 0, clientX: 2, clientY: 65 })
    const notPrevented = document.dispatchEvent(lostMove)
    expect(notPrevented).toBe(true)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    // Fully unregistered: a later held-button move cannot resurrect it.
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 2, clientY: 95 }))
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 95 }))
    editor.destroy()
  })
})

describe("drag-extend — padding mousedown on MBS-covered block stays dormant", () => {
  it("does not set up pending state or dispatch MBS when resolved block is inside current MBS", () => {
    const editor = makeEditor()
    const outer = container.querySelector(".ProseMirror") as HTMLElement
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null

    const blocks = container.querySelectorAll(".rune-block")
    blocks.forEach((b, i) => {
      ;(b as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    })

    // Establish MBS over blocks 0..1 (B1+B2).
    editor.commands.setBlockSelection({ from: 0, to: 1 })
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    const before = editor.state.selection

    // Padding mousedown at Y inside B0 (MBS-covered) — drag-extend MUST NOT
    // claim this gesture; it must stay dormant so block-drag can pick up.
    outer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 10 }))

    // Selection unchanged — drag-extend did NOT dispatch a fresh MBS.
    expect(editor.state.selection).toBe(before)

    // No listeners attached — a follow-up mousemove should not extend.
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 2, clientY: 80 }))
    expect(editor.state.selection).toBe(before)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 80 }))
    editor.destroy()
  })

  it("in-block padding mousedown on a block OUTSIDE current MBS still dispatches via entry B", () => {
    // Post-Option-3 entry B owns in-block vertical padding (target IS
    // a `.rune-block` but Y is outside the content rect). Mousedown
    // lands on block 3's vertical padding while MBS covers B0..B1.
    const editor = makeEditor()
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null

    const blocks = container.querySelectorAll(".rune-block")
    blocks.forEach((b, i) => {
      ;(b as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: i * 30, toJSON: () => ({}) }) as DOMRect
      const content = (b as HTMLElement).querySelector(".rune-block-content") as HTMLElement | null
      if (content) {
        content.getBoundingClientRect = () =>
          ({ top: i * 30 + 8, bottom: i * 30 + 12, left: 0, right: 60, width: 60, height: 4, x: 0, y: i * 30 + 8, toJSON: () => ({}) }) as DOMRect
      }
    })

    editor.commands.setBlockSelection({ from: 0, to: 1 })

    // Block 3 covers Y [90, 110]; its content rect is [98, 102]. Y=92
    // sits in the block's top padding — in-block, but outside content.
    const block3 = blocks[3] as HTMLElement
    block3.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 92 }))

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([3, 3])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 92 }))
    editor.destroy()
  })

  it("no MBS active — in-block padding mousedown still dispatches via entry B (regression)", () => {
    const editor = makeEditor()
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null

    const blocks = container.querySelectorAll(".rune-block")
    blocks.forEach((b, i) => {
      ;(b as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: i * 30, toJSON: () => ({}) }) as DOMRect
      const content = (b as HTMLElement).querySelector(".rune-block-content") as HTMLElement | null
      if (content) {
        content.getBoundingClientRect = () =>
          ({ top: i * 30 + 8, bottom: i * 30 + 12, left: 0, right: 60, width: 60, height: 4, x: 0, y: i * 30 + 8, toJSON: () => ({}) }) as DOMRect
      }
    })

    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)

    const block0 = blocks[0] as HTMLElement
    block0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 2 }))

    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 2 }))
    editor.destroy()
  })

  it("padding mousedown in the void BELOW all blocks is a no-op (strict)", () => {
    const editor = makeEditor()
    const outer = container.querySelector(".ProseMirror") as HTMLElement
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null

    const blocks = container.querySelectorAll(".rune-block")
    blocks.forEach((b, i) => {
      ;(b as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    })

    const before = editor.state.selection
    // Y = 9999 is below every block.
    outer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 9999 }))
    expect(editor.state.selection).toBe(before)

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 2, clientY: 9999 }))
    editor.destroy()
  })
})

describe("drag-extend — GS-2 probes: any-button release + lost-mouseup", () => {
  // Geometry shared by probe (a) and probe (b): block 0 covers Y [0,20],
  // content [8,12]; block 1 covers Y [30,50], content [38,42].
  function mockBlockRects(blocks: NodeListOf<Element>) {
    blocks.forEach((b, i) => {
      ;(b as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 20, left: 0, right: 100, width: 100, height: 20, x: 0, y: i * 30, toJSON: () => ({}) }) as DOMRect
      const content = (b as HTMLElement).querySelector(".rune-block-content") as HTMLElement | null
      if (content) {
        content.getBoundingClientRect = () =>
          ({ top: i * 30 + 8, bottom: i * 30 + 12, left: 0, right: 60, width: 60, height: 4, x: 0, y: i * 30 + 8, toJSON: () => ({}) }) as DOMRect
      }
    })
  }

  // ── Probe (a) ────────────────────────────────────────────────────────────
  // A right-button (button:2) mouseup mid-gesture must NOT end the gesture.
  // The gesture was started with a left-press in block 0's top padding;
  // after a right-button mouseup the next primary-button mousemove must still
  // extend the selection, and only a primary mouseup (button:0) cleans up.
  // GS-2 regression guard: a non-primary release must not end the gesture —
  // onUp gates on isPrimaryRelease.
  it("(a) non-primary mouseup (button:2) does not end the block-mode gesture — gesture continues", () => {
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph, Heading, BlockId, BlockSelection, GestureStatePlugin],
      content: "<p>Block 1</p><p>Block 2</p><p>Block 3</p><p>Block 4</p>",
    })
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null
    const blocks = container.querySelectorAll(".rune-block")
    mockBlockRects(blocks)

    // Left-press in block 0's top padding → entry B arms the gesture and
    // dispatches a single-block MBS at mousedown (anchor=head=block 0).
    const block0 = blocks[0] as HTMLElement
    block0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 2 }))
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])
    // Registry is claimed as "drag-extend".
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("drag-extend")

    // Right-button mouseup (context menu release) — must NOT clear the gesture.
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 2, clientX: 2, clientY: 2 }))

    // Registry must still read "drag-extend" (gesture is alive).
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("drag-extend")
    // Selection unchanged — the single-block MBS on block 0 remains.
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    // A subsequent primary mouseup ends it correctly.
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 2, clientY: 2 }))
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()

    editor.destroy()
  })

  // ── Probe (b) ────────────────────────────────────────────────────────────
  // A mid-gesture mousemove with buttons:0 (lost mouseup — alt-tab case) must
  // abort the gesture via the cancel path. The guard already lives at onMove
  // line 323; this probe documents it under the GS-2 label and confirms the
  // shared-protocol migration does not regress it.
  it("(b) buttons:0 mousemove mid block-mode gesture aborts; registry released; no further extension", () => {
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph, Heading, BlockId, BlockSelection, GestureStatePlugin],
      content: "<p>Block 1</p><p>Block 2</p><p>Block 3</p><p>Block 4</p>",
    })
    ;(editor.view.posAtCoords as unknown as (coords: { left: number; top: number }) => { pos: number; inside: number } | null) =
      () => null
    const blocks = container.querySelectorAll(".rune-block")
    mockBlockRects(blocks)

    // Arm: left-press in block 0's top padding.
    const block0 = blocks[0] as HTMLElement
    block0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 2 }))
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect(gestureKey.getState(editor.state)?.activeGesture).toBe("drag-extend")

    // Lost mouseup: buttons:0 move → abort via clear().
    const lostMove = new MouseEvent("mousemove", { bubbles: true, cancelable: true, buttons: 0, clientX: 2, clientY: 65 })
    const notPrevented = document.dispatchEvent(lostMove)
    expect(notPrevented).toBe(true) // no preventDefault on a cancelled gesture move
    // Registry released.
    expect(gestureKey.getState(editor.state)?.activeGesture).toBeNull()
    // Selection left as-is (single-block MBS on block 0 — not cleared).
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    // Fully unregistered: a later held-button move cannot resurrect the gesture.
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 2, clientY: 95 }))
    expect((editor.state.selection as MultiBlockSelection).blockIndices).toEqual([0, 0])

    editor.destroy()
  })
})
