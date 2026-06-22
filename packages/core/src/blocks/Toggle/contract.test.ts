// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { NodeSelection } from "@tiptap/pm/state"
import { createBlockSpec } from "../../schema"
import { createRuneKit } from "../../kit"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { toggleBodyRange } from "./range"
import { expandCollapsedToggles } from "./expandSlice"
import { getBlockSpecs } from "../../schema"

const SyntheticAtom = createBlockSpec({
  type: "syntheticAtom",
  content: "",
  parseDOM: [{ tag: "div.synthetic-atom" }],
  renderDOM: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, class: "rune-block synthetic-atom" },
    ["div", { class: "rune-block-content" }, "atom"],
  ],
  sideMenu: { draggable: true },
})

function freshWithSynthetic() {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return createTestEditor({
    element: el,
    extensions: [
      ...createRuneKit({
        blockIdTypes: [
          "paragraph",
          "heading",
          "toggle",
          "syntheticAtom",
          "bulletList",
          "numberedList",
          "taskList",
          "blockquote",
          "codeBlock",
          "divider",
          "table",
        ],
      }),
      SyntheticAtom,
    ],
  })
}

describe("Toggle body — accepts arbitrary block types (no hardcoded allowlist)", () => {
  it("toggleBodyRange includes a synthetic atom", () => {
    const editor = freshWithSynthetic()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: true }, content: [{ type: "text", text: "t" }] },
      { type: "syntheticAtom", attrs: { depth: 1 } },
    ])
    const r = toggleBodyRange(editor.state.doc, 0)
    expect(r.isEmpty).toBe(false)
  })

  it("collapsed hides a synthetic atom", () => {
    const editor = freshWithSynthetic()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: false }, content: [{ type: "text", text: "t" }] },
      { type: "syntheticAtom", attrs: { depth: 1 } },
    ])
    const hidden = editor.view.dom.querySelectorAll("[data-rune-hidden='1']")
    expect(hidden.length).toBe(1)
    expect((hidden[0] as HTMLElement).className).toContain("synthetic-atom")
  })

  it("copy slice includes a synthetic atom from a collapsed toggle", () => {
    const editor = freshWithSynthetic()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: false }, content: [{ type: "text", text: "t" }] },
      { type: "syntheticAtom", attrs: { depth: 1 } },
    ])
    return Promise.resolve().then(() => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
      const slice = editor.state.selection.content()
      const expanded = expandCollapsedToggles(slice, editor.state.doc)
      expect(expanded.content.childCount).toBe(2)
      expect(expanded.content.child(1).type.name).toBe("syntheticAtom")
    })
  })

  it("drag source range includes a synthetic atom in body", () => {
    const editor = freshWithSynthetic()
    editor.commands.setContent([
      { type: "toggle", attrs: { level: 0, expanded: false }, content: [{ type: "text", text: "t" }] },
      { type: "syntheticAtom", attrs: { depth: 1 } },
    ])
    const hook = getBlockSpecs(editor)["toggle"]!.dragSourceRange!
    const node = editor.state.doc.firstChild!
    const r = hook({ node, pos: 0, doc: editor.state.doc })
    expect(r.to).toBe(node.nodeSize + editor.state.doc.child(1).nodeSize)
  })
})
