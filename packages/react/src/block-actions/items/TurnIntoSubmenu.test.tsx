// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { createRuneKit } from "@ocai/rune-core"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { ReactNode } from "react"
import {
  ComponentsContext,
  defaultComponents,
} from "../../suggestion-menu/ComponentsContext"
import { TurnIntoSubmenu } from "./TurnIntoSubmenu"

// TurnIntoBody renders DefaultSuggestionMenu, which reads from
// ComponentsContext. In production this is installed by <RuneEditor>;
// here we install it manually so the submenu tree mounts.
function withProvider(node: ReactNode) {
  return (
    <ComponentsContext.Provider value={defaultComponents}>
      {node}
    </ComponentsContext.Provider>
  )
}

function createEditor() {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: createRuneKit(),
  })
  onTestFinished(() => {
    if (!editor.isDestroyed) editor.destroy()
  })
  return editor
}

function tableInput(id: string) {
  return { type: "table" as const, id, rows: [] }
}

describe("TurnIntoSubmenu", () => {
  it("renders Turn into row", () => {
    const editor = createEditor()
    editor.commands.setContent([
      { type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "x" }] },
    ])
    render(withProvider(<TurnIntoSubmenu editor={editor} sourceBlockIds={["p1"]} />))
    expect(screen.getByText("Turn into")).toBeInTheDocument()
  })

  it("dispatches turnInto on item click", async () => {
    const editor = createEditor()
    editor.commands.setContent([
      { type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text: "x" }] },
    ])
    const onAfterApply = vi.fn()
    render(
      withProvider(
        <TurnIntoSubmenu
          editor={editor}
          sourceBlockIds={["p1"]}
          onAfterApply={onAfterApply}
        />,
      ),
    )

    fireEvent.mouseEnter(screen.getByText("Turn into"))
    fireEvent.click(await screen.findByText("Heading 1"))

    expect(editor.state.doc.firstChild!.type.name).toBe("heading")
    expect(onAfterApply).toHaveBeenCalled()
  })

  it("returns null when source is a table", () => {
    const editor = createEditor()
    editor.commands.setContent([
      { type: "paragraph", attrs: { id: "before" }, content: [{ type: "text", text: "x" }] },
    ])
    editor.commands.insertBlocks(
      [tableInput("t1")],
      { at: { id: "before", side: "after" } },
    )
    const { container } = render(
      withProvider(<TurnIntoSubmenu editor={editor} sourceBlockIds={["t1"]} />),
    )
    // ComponentsContext.Provider wraps an empty children render with no
    // DOM of its own, so the container's first child is the provider's
    // empty fragment — assert via the section under test instead.
    expect(container.querySelector('[role="menuitem"]')).toBeNull()
  })

  it("returns null when source is an atom media block", () => {
    const editor = createEditor()
    editor.commands.setContent([
      {
        type: "image",
        attrs: {
          id: "img1",
          src: "https://example.com/image.png",
          alt: "",
        },
      },
    ])
    const { container } = render(
      withProvider(<TurnIntoSubmenu editor={editor} sourceBlockIds={["img1"]} />),
    )
    expect(container.querySelector('[role="menuitem"]')).toBeNull()
  })
})
