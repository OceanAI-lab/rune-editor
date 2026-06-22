// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../../test-utils/createTestEditor"
import { serializeInlineContent } from "../serializeInline"

function inlineFromEditor(json: Record<string, unknown>): string {
  const editor = createTestEditor({
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1", depth: 0 },
          ...json,
        },
      ],
    },
  })
  const para = editor.state.doc.firstChild!
  return serializeInlineContent(para)
}

describe("serializeInlineContent", () => {
  it("serializes plain text", () => {
    expect(
      inlineFromEditor({
        content: [{ type: "text", text: "hello world" }],
      }),
    ).toBe("hello world")
  })

  it("serializes bold", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
        ],
      }),
    ).toBe("**bold**")
  })

  it("serializes italic", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", marks: [{ type: "italic" }], text: "italic" },
        ],
      }),
    ).toBe("*italic*")
  })

  it("serializes strikethrough", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", marks: [{ type: "strike" }], text: "struck" },
        ],
      }),
    ).toBe("~~struck~~")
  })

  it("serializes inline code", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", marks: [{ type: "code" }], text: "code" },
        ],
      }),
    ).toBe("`code`")
  })

  it("serializes link", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [
              { type: "link", attrs: { href: "https://example.com" } },
            ],
            text: "click",
          },
        ],
      }),
    ).toBe("[click](https://example.com)")
  })

  it("serializes wikiLink with matching text and target", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [{ type: "wikiLink", attrs: { target: "My Page" } }],
            text: "My Page",
          },
        ],
      }),
    ).toBe("[[My Page]]")
  })

  it("serializes wikiLink with differing display text", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [{ type: "wikiLink", attrs: { target: "Target" } }],
            text: "Display",
          },
        ],
      }),
    ).toBe("[[Target|Display]]")
  })

  it("drops underline mark", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", marks: [{ type: "underline" }], text: "under" },
        ],
      }),
    ).toBe("under")
  })

  it("drops textColor and backgroundColor marks via textStyle", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [
              {
                type: "textStyle",
                attrs: { color: "#ff0000", backgroundColor: null },
              },
            ],
            text: "red",
          },
        ],
      }),
    ).toBe("red")
  })

  it("serializes multiple marks — bold italic", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [{ type: "bold" }, { type: "italic" }],
            text: "both",
          },
        ],
      }),
    ).toBe("***both***")
  })

  it("serializes mixed inline runs", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", text: "plain " },
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
          { type: "text", text: " end" },
        ],
      }),
    ).toBe("plain **bold** end")
  })

  it("serializes inlineMath atom node", () => {
    expect(
      inlineFromEditor({
        content: [
          { type: "text", text: "energy is " },
          {
            type: "inlineMath",
            attrs: { latex: "E = mc^2" },
          },
        ],
      }),
    ).toBe("energy is $E = mc^2$")
  })

  it("returns empty string for empty content", () => {
    expect(inlineFromEditor({})).toBe("")
  })

  it("escapes brackets in link text", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [
              { type: "link", attrs: { href: "https://example.com" } },
            ],
            text: "[test]",
          },
        ],
      }),
    ).toBe("[\\[test\\]](https://example.com)")
  })

  it("escapes parentheses in link href", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: { href: "https://example.com/page_(1)" },
              },
            ],
            text: "link",
          },
        ],
      }),
    ).toBe("[link](https://example.com/page_\\(1\\))")
  })

  it("wraps code containing backtick with double backticks", () => {
    expect(
      inlineFromEditor({
        content: [
          {
            type: "text",
            marks: [{ type: "code" }],
            text: "code`here",
          },
        ],
      }),
    ).toBe("`` code`here ``")
  })
})
