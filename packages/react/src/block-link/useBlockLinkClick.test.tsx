// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { createRuneKit } from "@ocai/rune-core"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import { useBlockLinkClick } from "./useBlockLinkClick"
import type { OpenRuneBlockLink, ParseRuneBlockLink } from "./types"

function makeEditor() {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: createRuneKit(),
    content:
      '<p><a href="/editor?doc=doc-a&amp;block=target">Doc A - Target</a> <a href="https://example.com">External</a></p>',
  })
  onTestFinished(() => {
    if (!editor.isDestroyed) editor.destroy()
    element.remove()
  })
  return editor
}

const parseBlockLink: ParseRuneBlockLink = (href) =>
  href.includes("doc=doc-a") && href.includes("block=target")
    ? { docId: "doc-a", blockId: "target", href, refTarget: "doc-a#target" }
    : null

function Harness({
  editor,
  openBlockLink,
}: {
  editor: Editor
  openBlockLink?: OpenRuneBlockLink
}) {
  useBlockLinkClick({ editor, parseBlockLink, openBlockLink })
  return null
}

describe("useBlockLinkClick", () => {
  it("routes recognized block links through openBlockLink and prevents default", () => {
    const editor = makeEditor()
    const openBlockLink = vi.fn()
    render(<Harness editor={editor} openBlockLink={openBlockLink} />)

    const link = editor.view.dom.querySelector("a")!
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(openBlockLink).toHaveBeenCalledWith(
      expect.objectContaining({
        editor,
        target: expect.objectContaining({ docId: "doc-a", blockId: "target" }),
      }),
    )
  })

  it("ignores normal links", () => {
    const editor = makeEditor()
    const openBlockLink = vi.fn()
    render(<Harness editor={editor} openBlockLink={openBlockLink} />)

    const link = editor.view.dom.querySelectorAll("a")[1]!
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(openBlockLink).not.toHaveBeenCalled()
  })

  it("lets recognized links behave normally when openBlockLink is omitted", () => {
    const editor = makeEditor()
    render(<Harness editor={editor} />)

    const link = editor.view.dom.querySelector("a")!
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it("still routes recognized links when the editor is read-only", () => {
    const editor = makeEditor()
    editor.setEditable(false)
    const openBlockLink = vi.fn()
    render(<Harness editor={editor} openBlockLink={openBlockLink} />)

    const link = editor.view.dom.querySelector("a")!
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(openBlockLink).toHaveBeenCalledTimes(1)
  })
})
