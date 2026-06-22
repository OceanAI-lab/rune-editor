// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../Paragraph/block"
import { Table } from "./block"
import { __internals } from "./PinColumnWidths"
import { INTERNAL_NORMALIZATION_META } from "../../extensions/internal-meta"

const rafQueue: FrameRequestCallback[] = []

function flushOneFrame() {
  const cb = rafQueue.shift()
  if (!cb) return false
  cb(0)
  return true
}

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document,
      Text,
      Paragraph,
      Table,
    ],
  })
}

function setTableContent(editor: Editor, attrs: Record<string, unknown> = {}) {
  editor.commands.setContent({
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { id: "t", depth: 0, ...attrs },
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "tableParagraph", content: [{ type: "text", text: "A" }] }] },
              { type: "tableHeader", content: [{ type: "tableParagraph", content: [{ type: "text", text: "B" }] }] },
            ],
          },
        ],
      },
    ],
  })
}

function stubCellWidths(editor: Editor, widths: number[]) {
  const cells = editor.view.dom.querySelectorAll<HTMLElement>("th, td")
  cells.forEach((cell, index) => {
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue({
      width: widths[index] ?? 0,
      height: 20,
      top: 0,
      left: 0,
      right: widths[index] ?? 0,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    } as DOMRect)
  })
}

function anyCellPinnedTo(editor: Editor, width: number) {
  let found = false
  editor.state.doc.firstChild?.descendants((node) => {
    if (node.attrs.colwidth?.[0] === width) found = true
    return !found
  })
  return found
}

describe("PinColumnWidths", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
  })

  afterEach(() => {
    rafQueue.length = 0
    vi.restoreAllMocks()
  })

  it("pins measured widths into cell.attrs.colwidth on first rAF", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [111, 222])

    expect(flushOneFrame()).toBe(true)
    expect(anyCellPinnedTo(editor, 111)).toBe(true)
    expect(anyCellPinnedTo(editor, 222)).toBe(true)
    editor.destroy()
  })

  it("dispatches pin transaction with addToHistory:false and internal-normalization meta", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [111, 222])
    const dispatch = vi.spyOn(editor.view, "dispatch")

    flushOneFrame()

    expect(dispatch).toHaveBeenCalled()
    const pinTx = dispatch.mock.calls
      .map(([tr]) => tr)
      .find((tr) => tr.getMeta("addToHistory") === false)
    expect(pinTx).toBeDefined()
    expect(pinTx!.getMeta(INTERNAL_NORMALIZATION_META)).toBe(true)
    editor.destroy()
  })

  it("retries once when widths measure 0 and retries pin after widths arrive", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [0, 0])

    expect(flushOneFrame()).toBe(true)
    expect(rafQueue).toHaveLength(1)
    stubCellWidths(editor, [111, 222])
    expect(flushOneFrame()).toBe(true)
    expect(anyCellPinnedTo(editor, 111)).toBe(true)
    editor.destroy()
  })

  it("gives up after failed retry; no third frame queued", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [0, 0])

    expect(flushOneFrame()).toBe(true)
    expect(flushOneFrame()).toBe(true)
    expect(rafQueue).toHaveLength(0)
    editor.destroy()
  })

  it("is idempotent after successful pin", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [111, 222])
    flushOneFrame()
    const dispatch = vi.spyOn(editor.view, "dispatch")

    const table = editor.view.dom.querySelector("table") as HTMLTableElement
    expect(__internals.pinAllColumnWidths(editor.view, table)).toBe(true)
    expect(dispatch.mock.calls.filter(([tr]) => tr.getMeta("addToHistory") === false)).toHaveLength(0)
    editor.destroy()
  })

  it("does not run queued frames after destroy", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [111, 222])
    const dispatch = vi.spyOn(editor.view, "dispatch")

    editor.destroy()
    expect(() => flushOneFrame()).not.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("cancels queued retry frames after destroy", () => {
    const editor = makeEditor()
    setTableContent(editor)
    stubCellWidths(editor, [0, 0])
    const dispatch = vi.spyOn(editor.view, "dispatch")

    expect(flushOneFrame()).toBe(true)
    expect(rafQueue).toHaveLength(1)
    editor.destroy()

    expect(() => flushOneFrame()).not.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
