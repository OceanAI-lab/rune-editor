// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import {
  getMediaImportState,
  getMediaPopoverBlockId,
} from "@ocai/rune-core"
import { RuneEditor } from "../../RuneEditor"
import type { Editor } from "@tiptap/react"

const EMPTY_VIDEO_DOC = {
  type: "doc",
  content: [
    {
      type: "video",
      attrs: {
        id: "video1",
        sourceType: "asset",
        src: "",
        embedUrl: null,
        provider: null,
        sourceUrl: null,
        title: "",
        width: null,
        height: null,
      },
    },
  ],
}

const EMPTY_AUDIO_DOC = {
  type: "doc",
  content: [
    {
      type: "audio",
      attrs: {
        id: "audio1",
        sourceType: "asset",
        src: "",
        embedUrl: null,
        provider: null,
        sourceUrl: null,
        title: "",
        width: null,
        height: null,
      },
    },
  ],
}

type RuneEditorTestProps = ComponentProps<typeof RuneEditor>

async function renderEditor(props: RuneEditorTestProps) {
  let editor: Editor | null = null
  render(
    <RuneEditor
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

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 })
}

async function openMediaPopover(
  editor: Editor,
  {
    blockId,
    selector,
  }: {
    blockId: string
    selector: string
  },
) {
  const block = document.querySelector<HTMLElement>(
    `${selector}[data-id="${blockId}"]`,
  )
  expect(block).not.toBeNull()
  block!.getBoundingClientRect = () => new DOMRect(10, 10, 320, 180)

  expect(editor.commands.openMediaPopover(blockId)).toBe(true)
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument(),
  )
}

function blockAttrs(editor: Editor, blockId: string) {
  const doc = editor.getJSON()
  const node = doc.content?.find((item) => item.attrs?.id === blockId)
  return node?.attrs as Record<string, unknown>
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("MediaSourcePopover", () => {
  it("shows video labels and accepts video files", async () => {
    const editor = await renderEditor({ content: EMPTY_VIDEO_DOC })

    await openMediaPopover(editor, {
      blockId: "video1",
      selector: ".rune-block.rune-video",
    })

    expect(
      within(screen.getByRole("dialog")).getByText("Add a video"),
    ).toBeInTheDocument()
    const input = screen.getByLabelText("Choose video file")
    expect(input).toHaveAttribute("accept", "video/*")

    selectTab("Embed link")
    expect(screen.getByLabelText("Video URL")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Embed video" }),
    ).toBeInTheDocument()
  })

  it("submits video provider URLs through the media import hook with full context", async () => {
    const pending = new Promise<{
      kind: "embed"
      provider: "youtube"
      sourceUrl: string
      embedUrl: string
    }>(() => {})
    const importMediaUrl = vi.fn(() => pending)
    const editor = await renderEditor({
      content: EMPTY_VIDEO_DOC,
      importMediaUrl,
    })

    await openMediaPopover(editor, {
      blockId: "video1",
      selector: ".rune-block.rune-video",
    })
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }))

    expect(importMediaUrl).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      {
        blockId: "video1",
        kind: "video",
        nodeName: "video",
        source: "embed",
      },
    )
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("writes audio direct asset URLs without a host URL hook", async () => {
    const editor = await renderEditor({ content: EMPTY_AUDIO_DOC })

    await openMediaPopover(editor, {
      blockId: "audio1",
      selector: ".rune-block.rune-audio",
    })
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Audio URL"), {
      target: { value: "/track.mp3" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed audio" }))
    await flushPromises()

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(blockAttrs(editor, "audio1")).toMatchObject({
      sourceType: "asset",
      src: "/track.mp3",
    })
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })

  it("keeps blocked URLs in the popover and shows the kind-specific error", async () => {
    const editor = await renderEditor({ content: EMPTY_VIDEO_DOC })

    await openMediaPopover(editor, {
      blockId: "video1",
      selector: ".rune-block.rune-video",
    })
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "javascript:alert(1)" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }))

    expect(screen.getByText("Enter a valid video URL")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument()
    expect(getMediaPopoverBlockId(editor)).toBe("video1")
    expect(blockAttrs(editor, "video1").src).toBe("")
  })

  it("hides while import is active", async () => {
    const pending = new Promise<{
      kind: "asset"
      src: string
    }>(() => {})
    const importMediaUrl = vi.fn(() => pending)
    const editor = await renderEditor({
      content: EMPTY_VIDEO_DOC,
      importMediaUrl,
    })

    await openMediaPopover(editor, {
      blockId: "video1",
      selector: ".rune-block.rune-video",
    })
    selectTab("Embed link")
    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://cdn.example.com/clip.mp4" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Embed video" }))

    expect(getMediaImportState(editor, "video1")).toMatchObject({
      phase: "importing",
    })
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
  })

  it("closes and hides when the editor becomes read-only", async () => {
    const editor = await renderEditor({ content: EMPTY_VIDEO_DOC })

    await openMediaPopover(editor, {
      blockId: "video1",
      selector: ".rune-block.rune-video",
    })
    editor.setEditable(false)

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Upload" })).not.toBeInTheDocument(),
    )
    expect(getMediaPopoverBlockId(editor)).toBeNull()
  })
})
