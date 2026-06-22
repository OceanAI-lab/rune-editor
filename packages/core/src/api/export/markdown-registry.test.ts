// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { JSONContent } from "@tiptap/core"
import { createBlockSpec } from "../../schema"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { exportMarkdown } from "./markdown"

const CustomMarkdownBlock = createBlockSpec({
  type: "customMarkdown",
  content: "inline*",
  parseDOM: [{ tag: "p[data-custom-markdown]" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
  toMarkdown({ prefix, serializeInline, node }) {
    return {
      line: `${prefix}custom:${serializeInline(node)}`,
      spacing: "isolated",
    }
  },
})

const NoMarkdownBlock = createBlockSpec({
  type: "noMarkdownBlock",
  content: "inline*",
  parseDOM: [{ tag: "p[data-no-markdown]" }],
  renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
})

function textBlock(
  type: string,
  text: string,
  attrs: Record<string, unknown> = {},
): JSONContent {
  return {
    type,
    attrs: { id: `${type}-${text}`, depth: 0, ...attrs },
    content: text ? [{ type: "text", text }] : undefined,
  }
}

function createMarkdownPluginEditor(content: JSONContent[]) {
  return createTestEditor({
    kit: {
      plugins: [
        {
          id: "markdown-registry-fixture",
          blockExtensions: [CustomMarkdownBlock, NoMarkdownBlock],
        },
      ],
    },
    content: { type: "doc", content },
  })
}

describe("exportMarkdown registry serializers", () => {
  it("exports plugin block serializers registered through RunePlugin", () => {
    const editor = createMarkdownPluginEditor([
      textBlock("customMarkdown", "hello", { depth: 1 }),
    ])

    expect(exportMarkdown(editor)).toBe("    custom:hello\n")
  })

  it("skips plugin blocks without toMarkdown without crashing", () => {
    const editor = createMarkdownPluginEditor([
      textBlock("paragraph", "before"),
      textBlock("noMarkdownBlock", "not exported"),
      textBlock("paragraph", "after"),
    ])

    expect(() => exportMarkdown(editor)).not.toThrow()
    expect(exportMarkdown(editor)).toBe("before\n\nafter\n")
  })

  it("keeps blank-line spacing centralized around plugin serializers", () => {
    const editor = createMarkdownPluginEditor([
      textBlock("paragraph", "before"),
      textBlock("customMarkdown", "middle"),
      textBlock("paragraph", "after"),
    ])

    expect(exportMarkdown(editor)).toBe("before\n\ncustom:middle\n\nafter\n")
  })

  it("keeps numbered-list counters centralized across plugin serializers", () => {
    const seenNumberedIndexes: Array<number | undefined> = []
    const CounterProbeBlock = createBlockSpec({
      type: "counterProbeBlock",
      content: "inline*",
      parseDOM: [{ tag: "p[data-counter-probe]" }],
      renderDOM: ({ HTMLAttributes }) => ["p", HTMLAttributes, 0],
      toMarkdown({ numberedIndex, prefix, serializeInline, node }) {
        seenNumberedIndexes.push(numberedIndex)
        return { line: `${prefix}probe:${serializeInline(node)}` }
      },
    })
    const editor = createTestEditor({
      kit: {
        plugins: [
          {
            id: "markdown-counter-probe",
            blockExtensions: [CounterProbeBlock],
          },
        ],
      },
      content: {
        type: "doc",
        content: [
          textBlock("numberedList", "first"),
          textBlock("counterProbeBlock", "middle"),
          textBlock("numberedList", "after"),
        ],
      },
    })

    expect(exportMarkdown(editor)).toBe("1. first\n\nprobe:middle\n\n1. after\n")
    expect(seenNumberedIndexes).toEqual([undefined])
  })
})
