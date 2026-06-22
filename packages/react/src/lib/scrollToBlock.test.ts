// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit, MultiBlockSelection } from "@ocai/rune-core"
import { onTestFinished } from "vitest"
import { scrollToBlock } from "./scrollToBlock"

function makeEditor() {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: createRuneKit(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "first" }] },
        { type: "paragraph", content: [{ type: "text", text: "second" }] },
        { type: "paragraph", content: [{ type: "text", text: "third" }] },
      ],
    },
  })
  onTestFinished(() => {
    if (!editor.isDestroyed) editor.destroy()
    element.remove()
  })
  return editor
}

function getBlockId(editor: Editor, index: number): string {
  const node = editor.state.doc.child(index)
  return node.attrs.id as string
}

describe("scrollToBlock", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element["scrollIntoView"]
  })

  it("returns false for an unknown block id", () => {
    const editor = makeEditor()
    expect(scrollToBlock(editor, "does-not-exist")).toBe(false)
  })

  it("returns true and calls scrollIntoView on the matching element", () => {
    const editor = makeEditor()
    const id = getBlockId(editor, 1)
    const el = editor.view.dom.querySelector(`[data-id="${id}"]`) as HTMLElement
    const spy = vi.spyOn(el, "scrollIntoView")
    expect(scrollToBlock(editor, id)).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toMatchObject({ behavior: "smooth", block: "start" })
  })

  it("sets a single-block MultiBlockSelection by default", () => {
    const editor = makeEditor()
    const id = getBlockId(editor, 2)
    scrollToBlock(editor, id)
    expect(editor.state.selection).toBeInstanceOf(MultiBlockSelection)
    const [lo, hi] = (editor.state.selection as MultiBlockSelection).blockIndices
    expect(lo).toBe(2)
    expect(hi).toBe(2)
  })

  it("skips selection when select=false", () => {
    const editor = makeEditor()
    const id = getBlockId(editor, 1)
    scrollToBlock(editor, id, { select: false })
    expect(editor.state.selection).not.toBeInstanceOf(MultiBlockSelection)
  })

  it("forwards behavior option to scrollIntoView", () => {
    const editor = makeEditor()
    const id = getBlockId(editor, 0)
    const el = editor.view.dom.querySelector(`[data-id="${id}"]`) as HTMLElement
    const spy = vi.spyOn(el, "scrollIntoView")
    scrollToBlock(editor, id, { behavior: "instant", select: false })
    expect(spy.mock.calls[0]![0]).toMatchObject({ behavior: "instant" })
  })
})
