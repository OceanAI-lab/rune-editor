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
import { CodeBlock } from "./block"
import type { RuneCodeBlock } from "./block"

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

describe("CodeBlock — schema", () => {
  it("parses <pre><code class=\"language-ts\">x</code></pre> with language: ts", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock],
      content: '<pre><code class="language-ts">x</code></pre>',
    })
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock")
    expect(editor.state.doc.firstChild?.textContent).toBe("x")
    expect(editor.state.doc.firstChild?.attrs.language).toBe("ts")
    editor.destroy()
  })

  it("parses bare <pre>x</pre> with language: null", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock],
      content: "<pre>x</pre>",
    })
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock")
    expect(editor.state.doc.firstChild?.textContent).toBe("x")
    expect(editor.state.doc.firstChild?.attrs.language).toBeNull()
    editor.destroy()
  })
})

describe("CodeBlock — input rule", () => {
  it("` ``` ` + space at paragraph start → empty code block, language: null", async () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{ type: "paragraph", attrs: { id: "p1", depth: 0 }, content: [{ type: "text", text: "```" }] }],
      },
    })
    editor.commands.setTextSelection(4)
    await triggerInputRule(editor, 4, " ")
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock")
    expect(editor.state.doc.firstChild?.attrs.language).toBeNull()
    editor.destroy()
  })

  it("` ```ts ` + space → code block, language: \"ts\"", async () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{ type: "paragraph", attrs: { id: "p1", depth: 0 }, content: [{ type: "text", text: "```ts" }] }],
      },
    })
    editor.commands.setTextSelection(6)
    await triggerInputRule(editor, 6, " ")
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock")
    expect(editor.state.doc.firstChild?.attrs.language).toBe("ts")
    editor.destroy()
  })
})

describe("CodeBlock — keyboard", () => {
  it("Enter in code block inserts soft newline", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "codeBlock",
          attrs: { id: "cb1", depth: 0, language: null },
          content: [{ type: "text", text: "line1" }],
        }],
      },
    })
    editor.commands.setTextSelection(6)
    const handler = getHandler(editor, "codeBlock--codeblock-keys", "Enter")
    expect(handler()).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toContain("\n")
    editor.destroy()
  })

  it("Tab in code block inserts two spaces", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "codeBlock",
          attrs: { id: "cb1", depth: 0, language: null },
          content: [{ type: "text", text: "x" }],
        }],
      },
    })
    editor.commands.setTextSelection(2)
    const handler = getHandler(editor, "codeBlock--codeblock-keys", "Tab")
    expect(handler()).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toContain("  ")
    editor.destroy()
  })

  it("Shift-Tab in code block is a no-op (handler returns true, doc unchanged)", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "codeBlock",
          attrs: { id: "cb1", depth: 0, language: null },
          content: [{ type: "text", text: "x" }],
        }],
      },
    })
    const before = editor.state.doc.firstChild?.textContent
    editor.commands.setTextSelection(2)
    const handler = getHandler(editor, "codeBlock--codeblock-keys", "Shift-Tab")
    expect(handler()).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe(before)
    editor.destroy()
  })

  it("Backspace at start of empty code block converts to paragraph", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "codeBlock",
          attrs: { id: "cb1", depth: 0, language: null },
          content: [],
        }],
      },
    })
    editor.commands.setTextSelection(1)
    const handler = getHandler(editor, "codeBlock--codeblock-keys", "Backspace")
    expect(handler()).toBe(true)
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    editor.destroy()
  })

  it("Backspace at start of non-empty code block returns false", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "codeBlock",
          attrs: { id: "cb1", depth: 0, language: null },
          content: [{ type: "text", text: "x" }],
        }],
      },
    })
    editor.commands.setTextSelection(1)
    const handler = getHandler(editor, "codeBlock--codeblock-keys", "Backspace")
    expect(handler()).toBe(false)
    editor.destroy()
  })
})

describe("CodeBlock — public projection", () => {
  it("toRuneBlock returns text + language + id + depth", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
      content: {
        type: "doc",
        content: [{
          type: "codeBlock",
          attrs: { id: "cb1", depth: 0, language: "ts" },
          content: [{ type: "text", text: "const x = 1" }],
        }],
      },
    })
    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "codeBlock")?.storage as {
        toRuneBlock?: (node: any) => unknown
      }
    const node = editor.state.doc.firstChild!
    const result = storage?.toRuneBlock?.(node) as RuneCodeBlock
    expect(result).toEqual({
      type: "codeBlock",
      id: "cb1",
      depth: 0,
      text: "const x = 1",
      language: "ts",
    })
    editor.destroy()
  })

  it("fromInput produces node with language attr", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph, CodeBlock, BlockCommands],
    })
    const storage = editor.extensionManager.extensions
      .find((e) => e.name === "codeBlock")?.storage as {
        fromInput?: (args: {
          schema: typeof editor.schema
          input: { type: string; id?: string; depth?: number; text?: string; language?: string | null }
          defaults: { depth: number; attrs?: Record<string, unknown>; content?: any; marks?: any; preserveContent?: boolean }
        }) => any
      }
    const node = storage.fromInput?.({
      schema: editor.schema,
      input: { type: "codeBlock", language: "ts", text: "x" },
      defaults: { depth: 0 },
    })
    expect(node?.type.name).toBe("codeBlock")
    expect(node?.attrs.language).toBe("ts")
    expect(node?.textContent).toBe("x")
    editor.destroy()
  })
})
