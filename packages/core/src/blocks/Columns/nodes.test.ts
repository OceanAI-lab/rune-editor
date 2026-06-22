// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Fragment } from "@tiptap/pm/model"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { RUNE_BLOCK_SPEC_METADATA } from "../../schema"
import { shouldIgnoreColumnMutation } from "./nodes"

describe("column structural node", () => {
  it("carries { id (default null), width (default 1) } attrs", () => {
    const editor = createTestEditor()
    const type = editor.schema.nodes.column!
    expect(type).toBeDefined()
    const node = type.createAndFill()!
    expect(node.attrs.id).toBe(null)
    expect(node.attrs.width).toBe(1)
  })

  it("has content block+ (children are first-class body blocks)", () => {
    const editor = createTestEditor()
    const type = editor.schema.nodes.column!
    const para = editor.schema.nodes.paragraph!.create()
    // A fragment of one body block is valid content; an empty column is not.
    expect(type.validContent(Fragment.from(para))).toBe(true)
    expect(type.validContent(Fragment.empty)).toBe(false)
    expect(() => type.create(null, para)).not.toThrow()
  })

  it("does NOT carry the __runeBlockSpec marker (invisible to body-block machinery)", () => {
    const editor = createTestEditor()
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "column",
    )
    expect(ext).toBeDefined()
    const storage = ext!.storage as { __runeBlockSpec?: boolean }
    expect(storage.__runeBlockSpec).toBeUndefined()
    // and no factory metadata marker.
    expect(RUNE_BLOCK_SPEC_METADATA in (ext as object)).toBe(false)
  })

  it("marshals id/width via data-col-id / data-col-width + --rune-col-width", () => {
    const editor = createTestEditor()
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "columnLayout",
          attrs: { id: "cl", depth: 0 },
          content: [
            {
              type: "column",
              attrs: { id: "col_a", width: 2 },
              content: [{ type: "paragraph" }],
            },
            {
              type: "column",
              attrs: { id: "col_b", width: 1 },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    })
    const html = editor.getHTML()
    expect(html).toContain('data-col-id="col_a"')
    expect(html).toContain('data-col-width="2"')
    expect(html).toContain("--rune-col-width: 2")
  })

  it("shouldIgnoreColumnMutation: attribute mutations only (resize preview writes), never content/selection", () => {
    // Column-resize's live preview writes inline `--rune-col-width` onto the
    // column DOM node. Without a NodeView-level ignoreMutation, PM's
    // DOMObserver treats that style write as an unsanctioned mutation and
    // redraws the layout subtree mid-drag (real browsers only — jsdom has no
    // MutationObserver flush in this path).
    expect(shouldIgnoreColumnMutation({ type: "attributes" })).toBe(true)
    // Real content mutations and selection probes MUST still reach PM.
    expect(shouldIgnoreColumnMutation({ type: "childList" })).toBe(false)
    expect(shouldIgnoreColumnMutation({ type: "characterData" })).toBe(false)
    expect(shouldIgnoreColumnMutation({ type: "selection" })).toBe(false)
  })

  it("live NodeView DOM mirrors renderHTML output (class, data-rune-column, id/width marshalling)", () => {
    // The column NodeView builds its root from the SAME DOM spec renderHTML
    // emits, so attrs (style/data-*) and the rune-column class must survive
    // on the live editor DOM (feedback_nodeview_html_attrs_merge probe).
    const editor = createTestEditor({
      element: document.createElement("div"),
      content: {
        type: "doc",
        content: [
          {
            type: "columnLayout",
            attrs: { id: "cl", depth: 0 },
            content: [
              {
                type: "column",
                attrs: { id: "col_a", width: 2 },
                content: [{ type: "paragraph" }],
              },
              {
                type: "column",
                attrs: { id: "col_b", width: 1 },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
    })
    const col = editor.view.dom.querySelector<HTMLElement>("[data-col-id='col_a']")
    expect(col).not.toBeNull()
    expect(col!.classList.contains("rune-column")).toBe(true)
    expect(col!.hasAttribute("data-rune-column")).toBe(true)
    expect(col!.getAttribute("data-col-width")).toBe("2")
    expect(col!.style.getPropertyValue("--rune-col-width").trim()).toBe("2")
    // contentDOM is live: the column's paragraph renders inside the root.
    expect(col!.querySelector("p")).not.toBeNull()
  })

  it("parseDOM only claims a column div inside a columnLayout wrapper", () => {
    const editor = createTestEditor()
    // A bare data-rune-column div with NO columnLayout parent must NOT
    // parse into a column node (it would fall back to page-body parsing).
    editor.commands.setContent(
      '<div data-rune-column><p>loose</p></div>',
    )
    const first = editor.state.doc.firstChild!
    expect(first.type.name).not.toBe("column")
  })
})
