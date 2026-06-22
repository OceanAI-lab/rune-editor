// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  getMediaImportState,
  getMediaPopoverBlockId,
} from "@ocai/rune-core"
import { RuneEditor } from "../../RuneEditor"
import type { Editor } from "@tiptap/react"

const EMPTY_IMAGE_DOC = {
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
}

const FILLED_IMAGE_DOC = {
  type: "doc",
  content: [
    {
      type: "image",
      attrs: {
        id: "img1",
        src: "https://example.com/existing.png",
        alt: "Existing",
        width: 320,
        height: 180,
      },
    },
  ],
}

const TWO_EMPTY_IMAGE_DOC = {
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
    {
      type: "image",
      attrs: {
        id: "img2",
        src: "",
        alt: "",
        width: null,
        height: null,
      },
    },
  ],
}

type RuneEditorTestProps = ComponentProps<typeof RuneEditor>

async function renderEditor(props: RuneEditorTestProps = {}) {
  let editor: Editor | null = null
  render(
    <RuneEditor
      content={EMPTY_IMAGE_DOC}
      {...props}
      onReady={(ed) => {
        editor = ed
        props.onReady?.(ed)
      }}
    />,
  )

  await waitFor(() => expect(editor).not.toBeNull())
  return editor!
}

// Radix Tabs.Trigger activates on mousedown (button 0), not click — see
// @radix-ui/react-tabs Trigger. fireEvent.click alone does not fire
// mousedown, so the tab never switches in jsdom. Use this helper instead.
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 })
}

async function openImagePopover(editor: Editor, blockId = "img1") {
  const block = document.querySelector<HTMLElement>(
    ".rune-block.rune-image[data-id=\"" + blockId + "\"]",
  )
  expect(block).not.toBeNull()
  block!.getBoundingClientRect = () =>
    new DOMRect(blockId === "img1" ? 10 : 40, 10, 240, 80)

  expect(editor.commands.openImagePopover(blockId)).toBe(true)
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument(),
  )
}

function imageAttrs(editor: Editor, blockId = "img1") {
  const doc = editor.getJSON()
  const node = doc.content?.find((item) => item.attrs?.id === blockId)
  return node?.attrs as Record<string, unknown>
}

describe("ImageEmptyPopover", () => {
  it("opens for active empty image block", async () => {
    const editor = await renderEditor()

    await openImagePopover(editor)

    expect(getMediaPopoverBlockId(editor)).toBe("img1")
    expect(screen.getByRole("tab", { name: "Embed link" })).toBeInTheDocument()
    expect(screen.getByLabelText("Choose image file")).toBeInTheDocument()
  })

  it("opens for a filled image block so it can be replaced", async () => {
    const editor = await renderEditor({ content: FILLED_IMAGE_DOC })

    await openImagePopover(editor)
    expect(screen.getByText("Replace image")).toBeInTheDocument()
  })

  it("opens for a failed image import so the source can be replaced", async () => {
    const importImageUrl = vi.fn(async () => {
      throw new Error("Unable to load image")
    })
    const editor = await renderEditor({ importImageUrl })

    expect(editor.commands.startImageUrlImport("img1", "https://example.com/missing.png", "embed")).toBe(true)
    await waitFor(() =>
      expect(getMediaImportState(editor, "img1")).toMatchObject({
        phase: "error",
      }),
    )

    await openImagePopover(editor)
    expect(screen.getByText("Replace image")).toBeInTheDocument()
  })

  it("anchors same-id image popovers inside the active editor root", async () => {
    let editorA: Editor | null = null
    let editorB: Editor | null = null
    render(
      <>
        <RuneEditor content={EMPTY_IMAGE_DOC} onReady={(ed) => { editorA = ed }} />
        <RuneEditor content={EMPTY_IMAGE_DOC} onReady={(ed) => { editorB = ed }} />
      </>,
    )

    await waitFor(() => {
      expect(editorA).not.toBeNull()
      expect(editorB).not.toBeNull()
    })

    const blocks = document.querySelectorAll<HTMLElement>(
      ".rune-block.rune-image-empty[data-id=\"img1\"]",
    )
    expect(blocks).toHaveLength(2)

    const firstRect = vi.fn(() => new DOMRect(10, 10, 240, 80))
    const secondRect = vi.fn(() => new DOMRect(400, 10, 240, 80))
    blocks[0]!.getBoundingClientRect = firstRect
    blocks[1]!.getBoundingClientRect = secondRect

    expect(editorB!.commands.openImagePopover("img1")).toBe(true)
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument(),
    )

    expect(secondRect).toHaveBeenCalled()
    expect(firstRect).not.toHaveBeenCalled()
  })

  it("disables upload when image file import hooks are missing", async () => {
    const editor = await renderEditor()

    await openImagePopover(editor)

    expect(screen.getByLabelText("Choose image file")).toBeDisabled()
    expect(
      screen.getByText("Host must wire importImageFile or importMediaFile"),
    ).toBeInTheDocument()
  })

  it("upload file starts picker import and closes popover", async () => {
    const pending = new Promise<{ src: string; width: number; height: number }>(() => {})
    const importImageFile = vi.fn(() => pending)
    const editor = await renderEditor({ importImageFile })
    const file = new File(["image-bytes"], "image.png", { type: "image/png" })

    await openImagePopover(editor)
    fireEvent.change(screen.getByLabelText("Choose image file"), {
      target: { files: [file] },
    })

    expect(importImageFile).toHaveBeenCalledWith(file, {
      blockId: "img1",
      source: "picker",
    })
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("hides when import state exists for the active image", async () => {
    const pending = new Promise<{ src: string; width: number; height: number }>(() => {})
    const importImageFile = vi.fn(() => pending)
    const editor = await renderEditor({ importImageFile })
    const file = new File(["image-bytes"], "image.png", { type: "image/png" })

    await openImagePopover(editor)
    const activeBlockId = getMediaPopoverBlockId(editor)
    expect(activeBlockId).toBe("img1")

    fireEvent.change(screen.getByLabelText("Choose image file"), {
      target: { files: [file] },
    })

    expect(getMediaImportState(editor, activeBlockId!)).toMatchObject({
      phase: "importing",
    })
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
  })

  it("embed link routes through importImageUrl when configured", async () => {
    const pending = new Promise<{ src: string; width: number; height: number }>(() => {})
    const importImageUrl = vi.fn(() => pending)
    const editor = await renderEditor({ importImageUrl })

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/image.png" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    expect(importImageUrl).toHaveBeenCalledWith("https://example.com/image.png", {
      blockId: "img1",
      source: "embed",
    })
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("embed link writes raw src when URL hooks are missing", async () => {
    const editor = await renderEditor()

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/raw.png" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(imageAttrs(editor)).toMatchObject({
      src: "https://example.com/raw.png",
      width: null,
      height: null,
      sourceUrl: "https://example.com/raw.png",
    })
  })

  it("targets the active empty image when multiple empty image blocks exist", async () => {
    const editor = await renderEditor({ content: TWO_EMPTY_IMAGE_DOC })

    await openImagePopover(editor, "img2")
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/img2.png" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(imageAttrs(editor, "img1").src).toBe("")
    expect(imageAttrs(editor, "img2").src).toBe("https://example.com/img2.png")
  })

  it("clears URL draft, tab, and error when popover re-anchors to a different block", async () => {
    const editor = await renderEditor({ content: TWO_EMPTY_IMAGE_DOC })

    await openImagePopover(editor, "img1")
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/leak.png" },
    })

    expect(editor.commands.openImagePopover("img2")).toBe(true)
    await waitFor(() => expect(getMediaPopoverBlockId(editor)).toBe("img2"))

    expect(screen.getByRole("tab", { name: "Upload", selected: true })).toBeInTheDocument()
    selectTab("Embed link")
    expect(screen.getByLabelText("Image URL")).toHaveValue("")
  })

  it("rejects empty and blocked-syntax URLs without mutating doc", async () => {
    const editor = await renderEditor()

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    expect(screen.getByText("Enter a valid image URL")).toBeInTheDocument()
    expect(imageAttrs(editor).src).toBe("")

    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/<bad>" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    expect(screen.getByText("Enter a valid image URL")).toBeInTheDocument()
    expect(imageAttrs(editor).src).toBe("")
    expect(getMediaPopoverBlockId(editor)).toBe("img1")
  })

  it.each([
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "blob:https://example.com/6d3a81a0-1111-4222-8333-c3dd2f9f89a3",
  ])("accepts %s image URLs", async (url) => {
    const editor = await renderEditor()

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: url },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(imageAttrs(editor).src).toBe(url)
  })

  it("rejects javascript URLs without mutating doc", async () => {
    const editor = await renderEditor()

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "javascript:alert(1)" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    expect(screen.getByText("Enter a valid image URL")).toBeInTheDocument()
    expect(imageAttrs(editor).src).toBe("")
    expect(getMediaPopoverBlockId(editor)).toBe("img1")
  })

  it("accepts custom host protocols like app-asset://", async () => {
    const editor = await renderEditor()

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "app-asset://photos/1.png" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed image" }))

    await waitFor(() =>
      expect(imageAttrs(editor).src).toBe("app-asset://photos/1.png"),
    )
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("preserves URL draft while switching tabs", async () => {
    const editor = await renderEditor({ importImageFile: vi.fn() })

    await openImagePopover(editor)
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "https://example.com/draft.png" },
    })
    selectTab("Upload")
    selectTab("Embed link")

    expect(screen.getByLabelText("Image URL")).toHaveValue(
      "https://example.com/draft.png",
    )
  })

  it("does not submit upload or URL while read-only", async () => {
    const importImageFile = vi.fn(async () => ({
      src: "/image.png",
      width: 100,
      height: 80,
    }))
    const importImageUrl = vi.fn(async () => ({
      src: "/remote.png",
      width: 120,
      height: 90,
    }))
    const editor = await renderEditor({ importImageFile, importImageUrl })

    await openImagePopover(editor)
    editor.setEditable(false)

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )

    expect(importImageFile).not.toHaveBeenCalled()
    expect(importImageUrl).not.toHaveBeenCalled()
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })
})
