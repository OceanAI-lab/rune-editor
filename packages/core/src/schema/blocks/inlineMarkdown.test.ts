// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { getSchema } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createRuneKit } from "../../kit"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { inlineContentFromText } from "./inlineMarkdown"

// inlineContentFromText turns a safe inline-markdown subset into marked inline
// nodes, so an AI/agent write of `**bold**` lands real formatting instead of
// literal `*` characters. Conservative: plain prose and code-ish text are never
// mis-marked. Uses the real rune kit schema (bold/italic/code/strike/link).

function runs(nodes: ProseMirrorNode[]): { text: string; marks: string[] }[] {
  return nodes.map((n) => ({
    text: n.text ?? "",
    marks: n.marks.map((m) => m.type.name).sort(),
  }))
}

describe("inlineContentFromText", () => {
  const schema = getSchema(createRuneKit())
  const parse = (text: string) => runs(inlineContentFromText(schema, text))

  it("plain text → one unmarked run", () => {
    expect(parse("hello world")).toEqual([{ text: "hello world", marks: [] }])
  })

  it("empty → no nodes", () => {
    expect(inlineContentFromText(schema, "")).toEqual([])
  })

  it("**bold** → bold mark, delimiters gone", () => {
    expect(parse("**important**")).toEqual([{ text: "important", marks: ["bold"] }])
  })

  it("splits surrounding plain text", () => {
    expect(parse("see **this** now")).toEqual([
      { text: "see ", marks: [] },
      { text: "this", marks: ["bold"] },
      { text: " now", marks: [] },
    ])
  })

  it("*italic* and _italic_", () => {
    expect(parse("*a*")).toEqual([{ text: "a", marks: ["italic"] }])
    expect(parse("_b_")).toEqual([{ text: "b", marks: ["italic"] }])
  })

  it("`code` — interior literal, no nested parsing", () => {
    expect(parse("run `a **b** c`")).toEqual([
      { text: "run ", marks: [] },
      { text: "a **b** c", marks: ["code"] },
    ])
  })

  it("~~strike~~", () => {
    expect(parse("~~gone~~")).toEqual([{ text: "gone", marks: ["strike"] }])
  })

  it("[label](url) → link with href", () => {
    const nodes = inlineContentFromText(schema, "[site](https://example.com)")
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.text).toBe("site")
    const link = nodes[0]!.marks.find((m) => m.type.name === "link")
    expect(link?.attrs.href).toBe("https://example.com")
  })

  it("nesting: **bold _and italic_**", () => {
    expect(parse("**bold _and italic_**")).toEqual([
      { text: "bold ", marks: ["bold"] },
      { text: "and italic", marks: ["bold", "italic"] },
    ])
  })

  it("backslash escapes a delimiter to a literal", () => {
    expect(parse("a \\*b\\* c")).toEqual([{ text: "a *b* c", marks: [] }])
  })

  describe("conservative — does NOT mis-mark", () => {
    it("spaced asterisks (math) stay literal", () => {
      expect(parse("2 * 3 * 4")).toEqual([{ text: "2 * 3 * 4", marks: [] }])
    })

    it("intra-word underscores stay literal", () => {
      expect(parse("foo_bar_baz")).toEqual([{ text: "foo_bar_baz", marks: [] }])
    })

    it("unclosed delimiter stays literal", () => {
      expect(parse("**oops")).toEqual([{ text: "**oops", marks: [] }])
    })

    it("a dangerous href is not turned into a link", () => {
      expect(parse("[x](javascript:alert(1))")).toEqual([
        { text: "[x](javascript:alert(1))", marks: [] },
      ])
    })
  })
})

describe("inline markdown applies through a text block's fromInput", () => {
  function firstMarkedText(doc: ProseMirrorNode, mark: string): ProseMirrorNode | null {
    let found: ProseMirrorNode | null = null
    doc.descendants((node) => {
      if (!found && node.isText && node.marks.some((m) => m.type.name === mark)) found = node
    })
    return found
  }

  it("insert_blocks paragraph with **bold** lands a bold mark (not literal `*`)", () => {
    const editor = createTestEditor({ content: "<p></p>" })
    editor.commands.insertBlocks([{ type: "paragraph", text: "x **bold** y" }], { at: "end" })
    const node = firstMarkedText(editor.state.doc, "bold")
    expect(node?.text).toBe("bold")
    // and the literal asterisks are gone from the document text
    expect(editor.state.doc.textContent).not.toContain("**")
  })

  it("CodeBlock keeps markdown literal (code is not parsed)", () => {
    const editor = createTestEditor({ content: "<p></p>" })
    editor.commands.insertBlocks([{ type: "codeBlock", text: "a **b** c", language: "text" }], {
      at: "end",
    })
    expect(firstMarkedText(editor.state.doc, "bold")).toBeNull()
    expect(editor.state.doc.textContent).toContain("**b**")
  })
})
