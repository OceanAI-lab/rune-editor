// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { TextSelection } from "@tiptap/pm/state"
import { getDocument } from "../../api/queries/getDocument"
import { columnsKeyboardKey } from "./keyboard"
import { MultiBlockSelection } from "../../extensions/block-selection/MultiBlockSelection"
import type { RuneColumnsBlock } from "./block"

function setColumns(editor: ReturnType<typeof createTestEditor>) {
  editor.commands.setContent({
    type: "doc",
    content: [
      { type: "paragraph", attrs: { id: "before" }, content: [{ type: "text", text: "before" }] },
      {
        type: "columnLayout",
        attrs: { id: "cl1", depth: 0 },
        content: [
          {
            type: "column",
            attrs: { id: "colL", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "left" }] }],
          },
          {
            type: "column",
            attrs: { id: "colR", width: 1 },
            content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
          },
        ],
      },
      { type: "paragraph", attrs: { id: "after" }, content: [{ type: "text", text: "after" }] },
    ],
  })
}

function startOf(editor: ReturnType<typeof createTestEditor>, id: string): number {
  let p = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.id === id) {
      p = pos + 1
      return false
    }
    return true
  })
  return p
}

function endOf(editor: ReturnType<typeof createTestEditor>, id: string): number {
  let p = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.id === id) {
      p = pos + 1 + node.content.size
      return false
    }
    return true
  })
  return p
}

function setCaret(editor: ReturnType<typeof createTestEditor>, pos: number) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)))
}

function press(editor: ReturnType<typeof createTestEditor>, key: string): boolean {
  const view = editor.view
  const event = new KeyboardEvent("keydown", { key })
  let handled = false
  view.someProp("handleKeyDown", (f) => {
    if (f(view, event)) {
      handled = true
      return true
    }
    return false
  })
  return handled
}

function caretColumnId(editor: ReturnType<typeof createTestEditor>): string | null {
  const $f = editor.state.selection.$from
  for (let d = $f.depth; d > 0; d--) {
    if ($f.node(d).type.name === "column") return $f.node(d).attrs.id as string
  }
  return null
}

function layoutShape(editor: ReturnType<typeof createTestEditor>) {
  const layout = getDocument(editor).find((b) => b.type === "columnLayout") as
    | RuneColumnsBlock
    | undefined
  return layout?.columns.map((c) => c.children.map((ch) => (ch as { text?: string }).text ?? ch.type))
}

describe("columns keyboard boundaries (Step 2)", () => {
  it("Backspace at start of the FIRST column's first block is a guarded no-op (no merge across the boundary)", () => {
    const editor = createTestEditor()
    setColumns(editor)
    setCaret(editor, startOf(editor, "L0"))
    const handled = press(editor, "Backspace")
    // Consumed by the columns guard so the browser's native backspace can't
    // pull the previous column / escape the layout either.
    expect(handled).toBe(true)
    // Document unchanged: still 2 columns, "left"/"right" intact, the root
    // "before" paragraph untouched.
    expect(layoutShape(editor)).toEqual([["left"], ["right"]])
    expect(getDocument(editor).filter((b) => b.type === "paragraph")).toHaveLength(2)
  })

  it("Backspace at start of the SECOND column's first block does NOT pull the first column's content", () => {
    const editor = createTestEditor()
    setColumns(editor)
    setCaret(editor, startOf(editor, "R0"))
    const handled = press(editor, "Backspace")
    expect(handled).toBe(true)
    // Right column's "right" stays put; left column is untouched — no merge.
    expect(layoutShape(editor)).toEqual([["left"], ["right"]])
  })

  it("the columns guard does NOT claim Backspace away from a column start (mid-text, root blocks)", () => {
    const editor = createTestEditor()
    setColumns(editor)
    const plugin = editor.view.state.plugins.find(
      (p) => (p.spec as { key?: unknown }).key === columnsKeyboardKey,
    )!
    const handleKeyDown = plugin.props.handleKeyDown as (
      view: typeof editor.view,
      e: KeyboardEvent,
    ) => boolean
    const bksp = () => new KeyboardEvent("keydown", { key: "Backspace" })

    // Mid-text inside the left column: guard must not fire.
    setCaret(editor, startOf(editor, "L0") + 2)
    expect(handleKeyDown(editor.view, bksp())).toBe(false)

    // Start of a ROOT paragraph (not inside any column): guard must not fire.
    setCaret(editor, startOf(editor, "after"))
    expect(handleKeyDown(editor.view, bksp())).toBe(false)

    // Start of the column's first block: guard DOES fire (consumes).
    setCaret(editor, startOf(editor, "L0"))
    expect(handleKeyDown(editor.view, bksp())).toBe(true)
  })

  it("Enter at the end of a column's last block creates a paragraph INSIDE the same column", () => {
    const editor = createTestEditor()
    setColumns(editor)
    setCaret(editor, endOf(editor, "L0"))
    press(editor, "Enter")
    // New caret stays in the left column.
    expect(caretColumnId(editor)).toBe("colL")
    // The left column now has two paragraphs; the right column is untouched.
    expect(layoutShape(editor)).toEqual([["left", ""], ["right"]])
  })

  it("Mod-A from inside a column reaches an all-root-blocks MultiBlockSelection that includes the layout (Cmd-A 2 stages)", () => {
    const el = document.createElement("div")
    document.body.appendChild(el)
    const editor = createTestEditor({ element: el })
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "before" }, content: [{ type: "text", text: "before" }] },
        {
          type: "columnLayout",
          attrs: { id: "cl1", depth: 0 },
          content: [
            {
              type: "column",
              attrs: { id: "colL", width: 1 },
              content: [{ type: "paragraph", attrs: { id: "L0" }, content: [{ type: "text", text: "left" }] }],
            },
            {
              type: "column",
              attrs: { id: "colR", width: 1 },
              content: [{ type: "paragraph", attrs: { id: "R0" }, content: [{ type: "text", text: "right" }] }],
            },
          ],
        },
      ],
    })
    // Caret inside the left column's paragraph.
    setCaret(editor, startOf(editor, "L0") + 1)

    const isMac = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
    const fireModA = () => {
      const ev = new KeyboardEvent("keydown", {
        key: "a",
        code: "KeyA",
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true,
        cancelable: true,
      })
      editor.view.dom.dispatchEvent(ev)
    }

    // Stage 1: caret/partial -> select the layout's whole text (still a
    // TextSelection, spanning the layout as one root block).
    fireModA()
    expect(editor.state.selection instanceof MultiBlockSelection).toBe(false)
    // Stage 2: whole-block-text -> MultiBlockSelection over ALL root blocks.
    fireModA()
    const sel = editor.state.selection
    expect(sel instanceof MultiBlockSelection).toBe(true)
    const [lo, hi] = (sel as MultiBlockSelection).blockIndices
    const N = editor.state.doc.childCount
    expect([lo, hi]).toEqual([0, N - 1])
    // The layout (root index 1) is within the selection; columns never appear
    // as their own selectable root blocks.
    expect(editor.state.doc.child(1).type.name).toBe("columnLayout")
  })

  it("the columns keyboard plugin never consumes arrow keys (PM defaults move the caret; never traps)", () => {
    // TODO(Task 9 e2e): arrow navigation across the isolating column boundary
    // (ArrowLeft/Right cross, ArrowDown at column N's last line) is PM/browser
    // default behavior that needs real caret geometry (getClientRects) —
    // pin it in the e2e suite. Here we assert ONLY that our columns plugin does not
    // claim arrows, so it never traps the caret. Invoke the plugin's own
    // handleKeyDown directly to avoid running Divider's vertical-arrow keymap
    // (which needs getClientRects, unavailable in jsdom).
    const editor = createTestEditor()
    setColumns(editor)
    setCaret(editor, endOf(editor, "L0"))
    const plugin = editor.view.state.plugins.find(
      (p) => (p.spec as { key?: unknown }).key === columnsKeyboardKey,
    )
    expect(plugin).toBeDefined()
    const handleKeyDown = plugin!.props.handleKeyDown as
      | ((view: typeof editor.view, e: KeyboardEvent) => boolean)
      | undefined
    expect(typeof handleKeyDown).toBe("function")
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) {
      expect(handleKeyDown!(editor.view, new KeyboardEvent("keydown", { key }))).toBe(false)
    }
  })
})
