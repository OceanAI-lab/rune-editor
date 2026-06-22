// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import { createRuneKit as kit } from "@ocai/rune-core"
import { copyBlocksToClipboard } from "./copyBlocksToClipboard"

interface ExecCommandHarness {
  restore: () => void
  capturedHtml: () => string | null
  capturedText: () => string | null
  capturedRuneJson: () => string | null
}

// jsdom doesn't implement `document.execCommand('copy')` end-to-end —
// it returns false and never fires a `copy` event. To exercise the
// helper's hijack-pattern in a unit test, we stub execCommand to
// synthesize a ClipboardEvent and dispatch it. This lets us assert that
// the helper:
//   * registers a listener BEFORE calling execCommand
//   * writes the three MIMEs onto clipboardData
//   * calls preventDefault on the event
function installExecCommandStub(): ExecCommandHarness {
  let capturedData: DataTransfer | null = null
  const original = document.execCommand
  document.execCommand = ((cmd: string) => {
    if (cmd !== "copy") return false
    const store = new Map<string, string>()
    const data = {
      get types() {
        return Array.from(store.keys())
      },
      clearData: () => store.clear(),
      setData: (mime: string, value: string) => {
        store.set(mime, value)
      },
      getData: (mime: string) => store.get(mime) ?? "",
    } as unknown as DataTransfer
    // jsdom doesn't implement ClipboardEvent; use a real Event so
    // dispatchEvent() accepts it, and pin clipboardData on it. The
    // helper attaches with capture-phase on document, so a document
    // dispatch with bubbles:true reaches it.
    const event = new Event("copy", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", { value: data })
    document.dispatchEvent(event)
    capturedData = data
    return event.defaultPrevented
  }) as typeof document.execCommand
  return {
    restore: () => {
      document.execCommand = original
    },
    capturedHtml: () => capturedData?.getData("text/html") ?? null,
    capturedText: () => capturedData?.getData("text/plain") ?? null,
    capturedRuneJson: () =>
      capturedData?.getData("application/x-rune-doc") ?? null,
  }
}

function makeEditor() {
  return new Editor({
    extensions: [...kit()],
    content: "<p>aaa</p><h2>bbb</h2><p>ccc</p>",
    element: document.createElement("div"),
  })
}

describe("copyBlocksToClipboard", () => {
  let harness: ExecCommandHarness

  beforeEach(() => {
    harness = installExecCommandStub()
  })
  afterEach(() => {
    harness.restore()
  })

  it("on empty selection (caret only): returns false, never calls execCommand", () => {
    const editor = makeEditor()
    // Default cursor is at top — slice from caret-only is size 0.
    const result = copyBlocksToClipboard(editor)
    expect(result).toBe(false)
    expect(harness.capturedHtml()).toBeNull()
    editor.destroy()
  })

  it("on `range: 'all'`: writes chrome-free html + text + rune-doc json", () => {
    const editor = makeEditor()
    const result = copyBlocksToClipboard(editor, "all")
    expect(result).toBe(true)
    const html = harness.capturedHtml()
    expect(html).not.toBeNull()
    expect(html!).toContain("bbb")
    expect(html!).not.toContain("rune-block")
    expect(html!).not.toContain("data-id")
    expect(harness.capturedText()).not.toBe("")
    const json = JSON.parse(harness.capturedRuneJson()!)
    expect(json.content.length).toBe(3)
    editor.destroy()
  })

  it("on selectAll → no range arg: copies the current selection", () => {
    const editor = makeEditor()
    editor.commands.selectAll()
    const result = copyBlocksToClipboard(editor)
    expect(result).toBe(true)
    expect(harness.capturedHtml()!).toContain("bbb")
    const json = JSON.parse(harness.capturedRuneJson()!)
    expect(json.content.length).toBe(3)
    editor.destroy()
  })

  it("restores the user's prior selection after the write", () => {
    const editor = makeEditor()
    // Install a host selection (simulating a foreign focused field).
    const host = document.createElement("textarea")
    host.value = "external"
    document.body.appendChild(host)
    host.focus()
    host.setSelectionRange(2, 5)
    // The helper writes via document.* selection — verify it doesn't
    // strand a selection on the hidden temp span. After the call,
    // textarea's range should still be intact.
    copyBlocksToClipboard(editor, "all")
    expect(host.selectionStart).toBe(2)
    expect(host.selectionEnd).toBe(5)
    host.remove()
    editor.destroy()
  })
})
