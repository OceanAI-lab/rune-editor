// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit } from "@ocai/rune-core"
import { useRuneEditorState } from "./useRuneEditorState"

function createEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: createRuneKit(),
    content: "<p>Initial</p>",
  })
}

const editors: Editor[] = []

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy()
})

function track(editor: Editor) {
  editors.push(editor)
  return editor
}

describe("useRuneEditorState", () => {
  it("reads the initial selected value", () => {
    const editor = track(createEditor())

    function Probe() {
      const text = useRuneEditorState(editor, (current) => current.state.doc.textContent)
      return <div data-testid="value">{text}</div>
    }

    render(<Probe />)

    expect(screen.getByTestId("value")).toHaveTextContent("Initial")
  })

  it("updates from editor transactions", async () => {
    const editor = track(createEditor())

    function Probe() {
      const text = useRuneEditorState(editor, (current) => current.state.doc.textContent)
      return <div data-testid="value">{text}</div>
    }

    render(<Probe />)

    act(() => {
      editor.commands.setContent("<p>Next</p>")
    })

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("Next")
    })
  })

  it("subscribes to transaction and update by default", () => {
    const editor = track(createEditor())
    const onSpy = vi.spyOn(editor, "on")

    function Probe() {
      useRuneEditorState(editor, (current) => current.state.doc.textContent)
      return null
    }

    render(<Probe />)

    expect(onSpy).toHaveBeenCalledWith("transaction", expect.any(Function))
    expect(onSpy).toHaveBeenCalledWith("update", expect.any(Function))
    expect(onSpy).not.toHaveBeenCalledWith("selectionUpdate", expect.any(Function))
  })

  it("updates from setEditable update events", async () => {
    const editor = track(createEditor())

    function Probe() {
      const editable = useRuneEditorState(editor, (current) => current.isEditable)
      return <div data-testid="value">{String(editable)}</div>
    }

    render(<Probe />)

    act(() => {
      editor.setEditable(false)
    })

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("false")
    })
  })

  it("uses equality to suppress unchanged object snapshots", async () => {
    const editor = track(createEditor())
    const renderSpy = vi.fn()

    function Probe() {
      const snapshot = useRuneEditorState(
        editor,
        (current) => ({ editable: current.isEditable }),
        { isEqual: (a, b) => a.editable === b.editable },
      )
      renderSpy(snapshot)
      return <div data-testid="value">{String(snapshot.editable)}</div>
    }

    render(<Probe />)
    expect(renderSpy).toHaveBeenCalledTimes(1)

    act(() => {
      editor.commands.setContent("<p>Still editable</p>")
    })

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(screen.getByTestId("value")).toHaveTextContent("true")
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it("caches object snapshots between editor events", async () => {
    const editor = track(createEditor())
    const renderSpy = vi.fn()

    function Probe() {
      const snapshot = useRuneEditorState(editor, (current) => ({
        text: current.state.doc.textContent,
      }))
      renderSpy(snapshot)
      return <div data-testid="value">{snapshot.text}</div>
    }

    render(<Probe />)

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(screen.getByTestId("value")).toHaveTextContent("Initial")
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it("re-reads when selector dependencies change", async () => {
    const editor = track(createEditor())

    function Probe({ suffix }: { suffix: string }) {
      const value = useRuneEditorState(
        editor,
        (current) => `${current.state.doc.textContent}${suffix}`,
        { deps: [suffix] },
      )
      return <div data-testid="value">{value}</div>
    }

    const { rerender } = render(<Probe suffix=" A" />)
    expect(screen.getByTestId("value")).toHaveTextContent("Initial A")

    rerender(<Probe suffix=" B" />)

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("Initial B")
    })
  })

  it("returns null when the editor is null", () => {
    function Probe() {
      const text = useRuneEditorState(
        null,
        (current) => current.state.doc.textContent,
      )
      return <div data-testid="value">{text === null ? "fallback" : text}</div>
    }

    render(<Probe />)

    expect(screen.getByTestId("value")).toHaveTextContent("fallback")
  })

  it("re-reads from a new editor and ignores the old one after a swap", async () => {
    const first = track(createEditor())
    const second = track(
      new Editor({
        element: document.createElement("div"),
        extensions: createRuneKit(),
        content: "<p>Second</p>",
      }),
    )

    function Probe({ editor }: { editor: Editor }) {
      const text = useRuneEditorState(
        editor,
        (current) => current.state.doc.textContent,
      )
      return <div data-testid="value">{text}</div>
    }

    const { rerender } = render(<Probe editor={first} />)
    expect(screen.getByTestId("value")).toHaveTextContent("Initial")

    rerender(<Probe editor={second} />)

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("Second")
    })

    act(() => {
      first.commands.setContent("<p>Old editor changed</p>")
    })

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(screen.getByTestId("value")).toHaveTextContent("Second")

    act(() => {
      second.commands.setContent("<p>New editor changed</p>")
    })

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent("New editor changed")
    })
  })
})
