// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../../blocks"
import { onEditorWrapperMouseDown } from "./wrapper-listener"

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement("div")
  container.className = "rune-editor"
  document.body.appendChild(container)
  if (typeof document.elementFromPoint !== "function") {
    ;(document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => null
  }
})

afterEach(() => {
  container.remove()
})

describe("onEditorWrapperMouseDown", () => {
  it("registers on the .rune-editor ancestor when it exists at call time (sync path)", () => {
    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph],
      content: "<p>A</p>",
    })
    const calls: string[] = []
    const off = onEditorWrapperMouseDown(editor.view, (e) => {
      calls.push((e.target as Element)?.tagName ?? "?")
    })

    // Click inside .rune-editor — wrapper listener fires.
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls.length).toBe(1)

    off()
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls.length).toBe(1) // unregister works

    editor.destroy()
  })

  it("defers registration via rAF when .rune-editor ancestor is not yet available (React mount path)", async () => {
    // Simulate Tiptap-without-React: Editor created with no element. view.dom
    // is detached at plugin.view() time — same situation as React EditorContent
    // before its mount effect runs.
    const editor = new Editor({
      extensions: [Document, Text, Paragraph],
      content: "<p>A</p>",
    })
    expect(editor.view.dom.closest(".rune-editor")).toBeNull()

    const calls: number[] = []
    const off = onEditorWrapperMouseDown(editor.view, () => {
      calls.push(1)
    })

    // Synchronously: listener NOT yet registered. Mount view.dom into wrapper.
    container.appendChild(editor.view.dom)

    // Dispatch a mousedown BEFORE the deferred install fires — should miss.
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls.length).toBe(0)

    // Wait for rAF (deferred install) to run.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    // Now listener is on .rune-editor — clicks fire.
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls.length).toBe(1)

    off()
    container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls.length).toBe(1)

    editor.destroy()
  })

  it("falls back to view.dom when no .rune-editor ancestor ever appears", async () => {
    // Edge case: editor mounted in a non-rune wrapper. Helper takes the
    // deferred path (closest() null at call), and after rAF still finds
    // no ancestor — falls back to view.dom so consumers don't silently
    // no-op for a non-Rune mount.
    const otherWrapper = document.createElement("div")
    otherWrapper.className = "other"
    document.body.appendChild(otherWrapper)
    const editor = new Editor({
      element: otherWrapper,
      extensions: [Document, Text, Paragraph],
      content: "<p>A</p>",
    })
    expect(editor.view.dom.closest(".rune-editor")).toBeNull()

    const calls: number[] = []
    const off = onEditorWrapperMouseDown(editor.view, () => {
      calls.push(1)
    })
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    editor.view.dom.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls.length).toBe(1)

    off()
    editor.destroy()
    otherWrapper.remove()
  })
})

describe("onEditorWrapperMouseDown — nested-editor isolation", () => {
  it("does not confuse a child editor wrapper for the parent editor wrapper", () => {
    // Two .rune-editor wrappers — outer (= container) and inner. Outer
    // listener attaches to the outer .rune-editor; bubble from a
    // mousedown inside the child wrapper resolves to the child via
    // closest('.rune-editor'), so the outer's listener fires with its
    // own currentTarget but consumers (marquee / tail-click) reject the
    // event after target.closest('.rune-editor') !== own checks.
    const childEditor = document.createElement("div")
    childEditor.className = "rune-editor"
    container.appendChild(childEditor)

    const editor = new Editor({
      element: container,
      extensions: [Document, Text, Paragraph],
      content: "<p>A</p>",
    })

    const calls: Array<EventTarget | null> = []
    const off = onEditorWrapperMouseDown(editor.view, (e) => calls.push(e.currentTarget))

    // The outer listener does fire — bubble reaches the outer
    // .rune-editor — but currentTarget is the outer container; the
    // child can be distinguished by inspecting event.target's nearest
    // .rune-editor, which is the consumer's job.
    childEditor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    expect(calls).toEqual([container])

    off()
    editor.destroy()
  })
})
