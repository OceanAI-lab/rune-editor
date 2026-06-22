// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Editor } from "@tiptap/core"
import { BlockLinkPasteMenu, type BlockLinkPasteState } from "./BlockLinkPasteMenu"

function state(overrides: Partial<BlockLinkPasteState> = {}): BlockLinkPasteState {
  return {
    href: "/editor?doc=doc-a&block=seed-tryit",
    target: {
      docId: "doc-a",
      blockId: "seed-tryit",
      href: "/editor?doc=doc-a&block=seed-tryit",
      refTarget: "doc-a#seed-tryit",
    },
    range: { from: 3, to: 39 },
    pending: false,
    error: false,
    ...overrides,
  }
}

// The menu now reads its rect live via useRangeAnchor(editor, range); these unit
// tests only exercise rendering/interaction, so a stub editor whose coordsAtPos
// yields a usable rect is enough to keep the popover mounted.
function fakeEditor(): Editor {
  return {
    isDestroyed: false,
    view: {
      dom: document.createElement("div"),
      coordsAtPos: () => ({ left: 10, top: 20, right: 130, bottom: 38 }),
    },
  } as unknown as Editor
}

afterEach(cleanup)

describe("BlockLinkPasteMenu", () => {
  it("renders nothing without state", () => {
    const { container } = render(
      <BlockLinkPasteMenu editor={fakeEditor()} state={null} onMention={vi.fn()} onUrl={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.textContent).toBe("")
  })

  it("renders paste choices for a pending block link", () => {
    render(
      <BlockLinkPasteMenu editor={fakeEditor()} state={state()} onMention={vi.fn()} onUrl={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText("Paste as")).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Mention" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "URL" })).toBeVisible()
  })

  it("chooses mention and URL from menu rows", () => {
    const onMention = vi.fn()
    const onUrl = vi.fn()
    render(
      <BlockLinkPasteMenu editor={fakeEditor()} state={state()} onMention={onMention} onUrl={onUrl} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole("menuitem", { name: "Mention" }))
    expect(onMention).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("menuitem", { name: "URL" }))
    expect(onUrl).toHaveBeenCalledTimes(1)
  })

  it("closes on Escape and chooses Mention on Enter", () => {
    const onMention = vi.fn()
    const onClose = vi.fn()
    render(
      <BlockLinkPasteMenu editor={fakeEditor()} state={state()} onMention={onMention} onUrl={vi.fn()} onClose={onClose} />,
    )
    const menu = screen.getByRole("menu")
    fireEvent.keyDown(menu, { key: "Enter" })
    expect(onMention).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(menu, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("disables Mention while pending and shows unavailable copy on error", () => {
    const { rerender } = render(
      <BlockLinkPasteMenu
        editor={fakeEditor()}
        state={state({ pending: true })}
        onMention={vi.fn()}
        onUrl={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole("menuitem", { name: "Mention" })).toHaveAttribute("aria-disabled", "true")

    rerender(
      <BlockLinkPasteMenu
        editor={fakeEditor()}
        state={state({ error: true })}
        onMention={vi.fn()}
        onUrl={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText("Unavailable block")).toBeVisible()
  })
})
