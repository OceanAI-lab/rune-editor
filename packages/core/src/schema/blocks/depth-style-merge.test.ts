// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"

describe("depth inline style coexists with list-numbering style", () => {
  // Contract: every draggable, factory-built body block must preserve the
  // factory-injected depth attrs (`data-depth` + inline `--rune-block-depth`)
  // on its outer `.rune-block` element when depth > 0.
  //
  // Adding a new draggable block? Append it to the array below — the only
  // entry-level invariants the test asserts are `data-id`, `data-depth`,
  // and the depth CSS var. If your block can't satisfy that contract via
  // `mergeBlockHTMLAttributes` (core renderDOM) or a NodeView that syncs
  // both keys together (see RuneTableView.syncAttrs), that's the bug.
  //
  // React-rendered NodeViews are NOT exercised here; see the React-side
  // sibling spec in packages/react for that coverage.
  it("draggable built-in blocks preserve factory depth attrs on the outer rune block", () => {
    const blocks = [
      { type: "paragraph", attrs: { id: "p", depth: 2 }, content: [{ type: "text", text: "p" }] },
      { type: "heading", attrs: { id: "h", depth: 2, level: 2 }, content: [{ type: "text", text: "h" }] },
      { type: "divider", attrs: { id: "d", depth: 2 } },
      { type: "equationBlock", attrs: { id: "e", depth: 2, latex: "x^2" } },
      { type: "bulletList", attrs: { id: "b", depth: 2 }, content: [{ type: "text", text: "b" }] },
      { type: "numberedList", attrs: { id: "n", depth: 2 }, content: [{ type: "text", text: "n" }] },
      { type: "taskList", attrs: { id: "t", depth: 2 }, content: [{ type: "text", text: "t" }] },
      { type: "blockquote", attrs: { id: "q", depth: 2 }, content: [{ type: "text", text: "q" }] },
      { type: "codeBlock", attrs: { id: "c", depth: 2 }, content: [{ type: "text", text: "code" }] },
      { type: "toggle", attrs: { id: "o", depth: 2 }, content: [{ type: "text", text: "toggle" }] },
      {
        type: "table",
        attrs: { id: "table", depth: 2 },
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "tableParagraph", content: [{ type: "text", text: "cell" }] }] },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: {
          id: "img",
          depth: 2,
          src: "https://example.com/a.png",
          alt: "",
          width: 640,
          height: 480,
        },
      },
    ]
    const editor = createTestEditor({
      content: { type: "doc", content: blocks } as never,
    })

    for (const block of blocks) {
      const dom = editor.view.dom.querySelector<HTMLElement>(
        `.rune-block[data-id="${block.attrs.id}"]`,
      )
      expect(dom, block.type).not.toBeNull()
      expect(dom!.getAttribute("data-depth"), block.type).toBe("2")
      expect(dom!.getAttribute("style") ?? "", block.type).toContain(
        "--rune-block-depth: 2",
      )
    }
  })

  it("a nested numbered list block carries both --rune-block-depth and --rune-list-index", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "numberedList", attrs: { depth: 0 }, content: [{ type: "text", text: "one" }] },
          { type: "numberedList", attrs: { depth: 2 }, content: [{ type: "text", text: "deep" }] },
        ],
      } as never,
    })

    const blocks = editor.view.dom.querySelectorAll(".rune-block")
    const deep = blocks[1] as HTMLElement
    const style = deep.getAttribute("style") ?? ""

    expect(style).toContain("--rune-block-depth: 2")
    expect(style).toContain("--rune-list-index")
    expect(deep.getAttribute("data-depth")).toBe("2")
  })

  it("depth=0 blocks have no --rune-block-depth nor data-depth", () => {
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "p" }] }],
      } as never,
    })
    const block = editor.view.dom.querySelector(".rune-block") as HTMLElement
    expect(block.getAttribute("data-depth")).toBeNull()
    const style = block.getAttribute("style") ?? ""
    expect(style).not.toContain("--rune-block-depth")
  })
})
