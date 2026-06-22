// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it, vi } from "vitest"
import { TextSelection } from "@tiptap/pm/state"
import { createTestEditor, type CreateTestEditorOptions } from "../../test-utils/createTestEditor"
import { getDocument } from "../../api"
import { getMediaPopoverBlockId } from "../../index"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function editorWithEmptyImage(options: CreateTestEditorOptions = {}) {
  return createTestEditor({
    ...options,
    content: options.content ?? {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            id: "img1",
            src: "",
            alt: "",
            width: null,
            height: null,
          },
        },
      ],
    } as never,
  })
}

describe("ImagePopover", () => {
  it("openImagePopover and closeImagePopover update plugin state", () => {
    const editor = editorWithEmptyImage()

    expect(getMediaPopoverBlockId(editor)).toBeNull()
    expect(editor.commands.openImagePopover("img1")).toBe(true)
    expect(getMediaPopoverBlockId(editor)).toBe("img1")
    expect(editor.commands.closeImagePopover()).toBe(true)
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("does not open for missing or non-image blocks", () => {
    const editor = editorWithEmptyImage({
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: "p1" },
            content: [{ type: "text", text: "Text" }],
          },
          {
            type: "image",
            attrs: {
              id: "img-populated",
              src: "https://example.com/a.png",
              alt: "",
            },
          },
        ],
      } as never,
    })

    expect(editor.commands.openImagePopover("missing")).toBe(false)
    expect(editor.commands.openImagePopover("p1")).toBe(false)
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("opens for a populated image block so its source can be replaced", () => {
    const editor = editorWithEmptyImage({
      content: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              id: "img-populated",
              src: "https://example.com/a.png",
              alt: "",
            },
          },
        ],
      } as never,
    })

    expect(editor.commands.openImagePopover("img-populated")).toBe(true)
    expect(getMediaPopoverBlockId(editor)).toBe("img-populated")
  })

  it("closes on selection changes and when the active image block is deleted", () => {
    const editor = editorWithEmptyImage({
      content: {
        type: "doc",
        content: [
          { type: "image", attrs: { id: "img1", src: "" } },
          {
            type: "paragraph",
            attrs: { id: "p1" },
            content: [{ type: "text", text: "After" }],
          },
        ],
      } as never,
    })

    expect(editor.commands.openImagePopover("img1")).toBe(true)
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
    )
    expect(getMediaPopoverBlockId(editor)).toBeNull()

    expect(editor.commands.openImagePopover("img1")).toBe(true)
    expect(editor.commands.deleteBlocks(["img1"])).toBe(true)
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("closes when import starts for the active image", () => {
    const pending = deferred<{ src: string; width: number; height: number }>()
    const importImageUrl = vi.fn(() => pending.promise)
    const editor = editorWithEmptyImage({
      kit: { importImageUrl },
    })

    expect(editor.commands.openImagePopover("img1")).toBe(true)
    expect(editor.commands.startImageUrlImport("img1", "https://source.example/a.png", "embed")).toBe(true)

    expect(importImageUrl).toHaveBeenCalled()
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("empty image placeholder click opens popover", () => {
    const editor = editorWithEmptyImage()
    const control = editor.view.dom.querySelector<HTMLElement>(".rune-image-empty-control")
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })

    expect(control).not.toBeNull()
    control!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(getMediaPopoverBlockId(editor)).toBe("img1")
  })

  it("placeholder click is gated while read-only", () => {
    const editor = editorWithEmptyImage()
    const control = editor.view.dom.querySelector<HTMLElement>(".rune-image-empty-control")
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })

    editor.setEditable(false)
    control!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(getMediaPopoverBlockId(editor)).toBeNull()
    expect(getDocument(editor)[0]).toMatchObject({ type: "image", id: "img1", src: "" })
  })

  it("closes when the editor flips to read-only", () => {
    const editor = editorWithEmptyImage()

    expect(editor.commands.openImagePopover("img1")).toBe(true)
    expect(getMediaPopoverBlockId(editor)).toBe("img1")

    editor.setEditable(false)

    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })
})
