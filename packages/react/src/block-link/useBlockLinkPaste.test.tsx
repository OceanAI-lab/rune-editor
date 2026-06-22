// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { createRuneKit } from "@ocai/rune-core"
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest"
import { BlockLinkPasteMenu } from "./BlockLinkPasteMenu"
import { useBlockLinkPaste } from "./useBlockLinkPaste"
import type { ParseRuneBlockLink, ResolveRuneRef } from "./types"

// jsdom doesn't implement getClientRects on Range / Text nodes.
// ProseMirror's scrollToSelection → coordsAtPos calls it during paste
// dispatch. Stub with a zero rect so the call doesn't throw.
beforeAll(() => {
  const zeroRect = () => new DOMRect(0, 0, 0, 0)
  const zeroRects = () => [zeroRect()] as unknown as DOMRectList
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = zeroRects
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = zeroRect
  }
})

function makeEditor() {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: createRuneKit(),
    content: "<p>Start </p>",
  })
  onTestFinished(() => {
    if (!editor.isDestroyed) editor.destroy()
    element.remove()
  })
  return editor
}

function parser(): ParseRuneBlockLink {
  return (href) =>
    href.includes("doc=doc-a") && href.includes("block=seed-tryit")
      ? { docId: "doc-a", blockId: "seed-tryit", href, refTarget: "doc-a#seed-tryit" }
      : null
}

function resolver(): ResolveRuneRef {
  return vi.fn(async () => ({ displayText: "Doc A - Try it" }))
}

function mockClipboardData(text: string): DataTransfer {
  const store = new Map<string, string>([["text/plain", text]])
  return {
    get types() {
      return Array.from(store.keys())
    },
    getData: (mime: string) => store.get(mime) ?? "",
    setData: (mime: string, value: string) => {
      store.set(mime, value)
    },
    clearData: () => {
      store.clear()
    },
  } as unknown as DataTransfer
}

function pastePlain(editor: Editor, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: mockClipboardData(text),
  })
  editor.view.dom.focus()
  editor.view.dom.dispatchEvent(event)
}

function Harness({
  editor,
  parseBlockLink = parser(),
  resolveRef = resolver(),
}: {
  editor: Editor
  parseBlockLink?: ParseRuneBlockLink
  resolveRef?: ResolveRuneRef
}) {
  const paste = useBlockLinkPaste({ editor, parseBlockLink, resolveRef })
  return (
    <BlockLinkPasteMenu
      editor={editor}
      state={paste.state}
      onMention={paste.chooseMention}
      onUrl={paste.chooseUrl}
      onClose={paste.close}
    />
  )
}

afterEach(cleanup)

describe("useBlockLinkPaste", () => {
  it("opens Paste as menu after a recognized URL is pasted into a collapsed selection", async () => {
    const editor = makeEditor()
    render(<Harness editor={editor} />)

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })

    await screen.findByText("Paste as")
    expect(screen.getByRole("menuitem", { name: "Mention" })).toBeVisible()
  })

  it("does not open for unrecognized URLs", async () => {
    const editor = makeEditor()
    render(<Harness editor={editor} />)

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "https://example.com")
    })

    await waitFor(() => {
      expect(screen.queryByText("Paste as")).toBeNull()
    })
  })

  it("does not open for a non-collapsed selection", async () => {
    const editor = makeEditor()
    render(<Harness editor={editor} />)

    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 })
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })

    await waitFor(() => {
      expect(screen.queryByText("Paste as")).toBeNull()
    })
  })

  it("choosing Mention replaces the pasted URL with a readable link label", async () => {
    const editor = makeEditor()
    render(<Harness editor={editor} />)

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })
    await screen.findByText("Paste as")

    await act(async () => {
      screen.getByRole("menuitem", { name: "Mention" }).click()
      await Promise.resolve()
    })

    expect(editor.getText()).toContain("Doc A - Try it")
    expect(editor.getText()).not.toContain("/editor?doc=doc-a&block=seed-tryit")
    const link = editor.view.dom.querySelector("a[data-rune-ref-kind]")
    expect(link?.getAttribute("data-rune-ref-kind")).toBe("block")
    expect(link?.getAttribute("data-rune-ref-target")).toBe("doc-a#seed-tryit")
    expect(link?.getAttribute("href")).toBeNull()
  })

  it("choosing URL leaves the raw URL in place", async () => {
    const editor = makeEditor()
    render(<Harness editor={editor} />)

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })
    await screen.findByText("Paste as")

    act(() => {
      screen.getByRole("menuitem", { name: "URL" }).click()
    })

    expect(editor.getText()).toContain("/editor?doc=doc-a&block=seed-tryit")
    expect(screen.queryByText("Paste as")).toBeNull()
  })

  it("keeps the URL and shows unavailable state when resolver returns null", async () => {
    const editor = makeEditor()
    render(<Harness editor={editor} resolveRef={async () => null} />)

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })
    await screen.findByText("Paste as")

    await act(async () => {
      screen.getByRole("menuitem", { name: "Mention" }).click()
      await Promise.resolve()
    })

    expect(editor.getText()).toContain("/editor?doc=doc-a&block=seed-tryit")
    expect(screen.getByText("Unavailable block")).toBeVisible()
  })

  it("keeps the URL and shows unavailable state when resolver rejects", async () => {
    const editor = makeEditor()
    render(
      <Harness
        editor={editor}
        resolveRef={async () => {
          throw new Error("lookup failed")
        }}
      />,
    )

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })
    await screen.findByText("Paste as")

    await act(async () => {
      screen.getByRole("menuitem", { name: "Mention" }).click()
      await Promise.resolve()
    })

    expect(editor.getText()).toContain("/editor?doc=doc-a&block=seed-tryit")
    expect(screen.getByText("Unavailable block")).toBeVisible()
  })

  it("stores host ref target, not dangerous href, so it is not navigable", async () => {
    const editor = makeEditor()
    render(
      <Harness
        editor={editor}
        parseBlockLink={(href) =>
          href === "javascript:alert(1)"
            ? { docId: "doc-a", blockId: "seed-tryit", href, refTarget: "doc-a#seed-tryit" }
            : null
        }
      />,
    )

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "javascript:alert(1)")
    })
    await screen.findByText("Paste as")

    await act(async () => {
      screen.getByRole("menuitem", { name: "Mention" }).click()
      await Promise.resolve()
    })

    expect(editor.getText()).toContain("Doc A - Try it")
    expect(editor.view.dom.querySelector('a[href^="javascript:"]')).toBeNull()
    const ref = editor.view.dom.querySelector("a[data-rune-ref-kind]")
    expect(ref?.getAttribute("data-rune-ref-kind")).toBe("block")
    expect(ref?.getAttribute("data-rune-ref-target")).toBe("doc-a#seed-tryit")
    expect(ref?.getAttribute("href")).toBeNull()
  })

  it("does not replace text if the pasted URL range changed while resolver was pending", async () => {
    const editor = makeEditor()
    let resolve!: (value: { displayText: string }) => void
    const promise = new Promise<{ displayText: string }>((r) => {
      resolve = r
    })
    render(<Harness editor={editor} resolveRef={() => promise} />)

    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size)
      pastePlain(editor, "/editor?doc=doc-a&block=seed-tryit")
    })
    await screen.findByText("Paste as")

    await act(async () => {
      screen.getByRole("menuitem", { name: "Mention" }).click()
    })

    act(() => {
      const docEnd = editor.state.doc.content.size
      editor.view.dispatch(
        editor.state.tr
          .setSelection(TextSelection.create(editor.state.doc, Math.max(1, docEnd - 10), docEnd))
          .insertText("changed"),
      )
    })

    await act(async () => {
      resolve({ displayText: "Doc A - Try it" })
      await promise
    })

    expect(editor.getText()).not.toContain("Doc A - Try it")
  })
})
