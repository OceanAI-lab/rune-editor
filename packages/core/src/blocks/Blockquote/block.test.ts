// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../Paragraph/block"
import { BlockCommands } from "../../api/commands"
import { Blockquote } from "./block"
import type { RuneBlockquoteBlock } from "./block"

function getHandler(editor: Editor, extName: string, key: string): () => boolean {
  const ext = editor.extensionManager.extensions.find((e) => e.name === extName)
  if (!ext) throw new Error(`Extension ${extName} not found`)
  const ctx = { editor, type: ext, options: ext.options }
  const rawHandler = (ext as any).config.addKeyboardShortcuts.call(ctx)[key] as ((arg: { editor: Editor }) => boolean) | undefined
  if (!rawHandler) throw new Error(`Shortcut ${key} not found`)
  return () => rawHandler({ editor })
}

async function triggerInputRule(editor: Editor, to: number, text: string) {
  const handled = editor.view.someProp("handleTextInput", (fn) =>
    fn(editor.view, to, to, text, null as any),
  )
  if (handled) return
  editor.view.dispatch(editor.state.tr.setMeta("applyInputRules", { from: to, text }))
  await new Promise((r) => setTimeout(r, 0))
}

describe("Blockquote — schema", () => {
  it("parses <blockquote> roundtrip", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, Blockquote],
      content: "<blockquote>hi</blockquote>",
    })
    const html = editor.getHTML()
    expect(html).toContain("<blockquote")
    expect(editor.state.doc.firstChild?.type.name).toBe("blockquote")
    expect(editor.state.doc.firstChild?.textContent).toBe("hi")
    editor.destroy()
  })
})

describe("Blockquote — input rule", () => {
  it("`> ` at paragraph start converts to blockquote", async () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, Blockquote, BlockCommands],
      content: {
        type: "doc",
        content: [{ type: "paragraph", attrs: { id: "p1", depth: 0 }, content: [{ type: "text", text: ">" }] }],
      },
    })
    editor.commands.setTextSelection(2)
    await triggerInputRule(editor, 2, " ")
    expect(editor.state.doc.firstChild?.type.name).toBe("blockquote")
    editor.destroy()
  })
})

describe("Blockquote — empty-Enter", () => {
  it("Enter on empty blockquote at depth=0 converts to paragraph", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, Blockquote, BlockCommands],
      content: {
        type: "doc",
        content: [{ type: "blockquote", attrs: { id: "bq1", depth: 0 }, content: [] }],
      },
    })
    editor.commands.setTextSelection(1)
    const handler = getHandler(editor, "blockquote--blockquote-keys", "Enter")
    expect(handler()).toBe(true)
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    editor.destroy()
  })

  it("Enter on non-empty blockquote returns false (PM default splits)", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, Blockquote, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "blockquote",
          attrs: { id: "bq1", depth: 0 },
          content: [{ type: "text", text: "hi" }],
        }],
      },
    })
    editor.commands.setTextSelection(3)
    const handler = getHandler(editor, "blockquote--blockquote-keys", "Enter")
    expect(handler()).toBe(false)
    editor.destroy()
  })
})

describe("Blockquote — public projection", () => {
  it("toRuneBlock returns text + id + depth", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, Blockquote, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "blockquote",
          attrs: { id: "bq1", depth: 1 },
          content: [{ type: "text", text: "x" }],
        }],
      },
    })
    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "blockquote")?.storage as {
        toRuneBlock?: (node: any) => unknown
      }
    const node = editor.state.doc.firstChild!
    const result = storage?.toRuneBlock?.(node) as RuneBlockquoteBlock
    expect(result).toEqual({
      type: "blockquote",
      id: "bq1",
      depth: 1,
      text: "x",
    })
    editor.destroy()
  })
})
