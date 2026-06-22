// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import { createTestEditor } from "../../test-utils/createTestEditor"

async function triggerInputRule(editor: Editor, to: number, text: string) {
  const handled = editor.view.someProp("handleTextInput", (fn) =>
    fn(editor.view, to, to, text, null as any),
  )
  if (handled) return
  editor.view.dispatch(editor.state.tr.setMeta("applyInputRules", { from: to, text }))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("InlineMath — input rule", () => {
  it("turns typed $$latex$$ into one inlineMath atom on the closing delimiter", async () => {
    const editor = createTestEditor({
      content: "<p>$$E=mc^2$</p>",
    })
    editor.commands.setTextSelection(10)

    await triggerInputRule(editor, 10, "$")

    const paragraph = editor.state.doc.firstChild
    expect(paragraph?.childCount).toBe(1)
    expect(paragraph?.child(0).type.name).toBe("inlineMath")
    expect(paragraph?.child(0).attrs.latex).toBe("E=mc^2")
  })

  it("does not create math for an empty trimmed capture", async () => {
    const editor = createTestEditor({
      content: "<p>$$ $</p>",
    })
    editor.commands.setTextSelection(5)

    await triggerInputRule(editor, 5, "$")

    expect(editor.state.doc.firstChild?.textContent).toBe("$$ $")
  })

  it("does not fire inside code marks", async () => {
    const editor = createTestEditor({
      content: "<p><code>$$x$</code></p>",
    })
    editor.commands.setTextSelection(5)

    await triggerInputRule(editor, 5, "$")

    expect(editor.state.doc.firstChild?.textContent).toBe("$$x$")
  })

  it("does not fire inside code-like blocks", async () => {
    const editor = createTestEditor({
      content: '<pre><code class="language-js">$$x$</code></pre>',
    })
    editor.commands.setTextSelection(5)

    await triggerInputRule(editor, 5, "$")

    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock")
    expect(editor.state.doc.firstChild?.textContent).toBe("$$x$")
  })
})
