// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor, JSONContent } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { createBlockSpec } from "../../schema"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { exportMarkdown } from "../export/markdown"

// Invoke the keyboard `Indent` extension's Backspace handler directly,
// bound to the real editor, so ONLY that handler runs (driving through
// `keyboardShortcut("Backspace")` would also fire PM's baseKeymap, which
// converts an empty block to a paragraph on its own and masks the
// extension's own classification-gated branch).
function pressIndentBackspace(editor: Editor): boolean {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "indent")
  if (!ext?.config.addKeyboardShortcuts) throw new Error("indent extension not found")
  const shortcuts = (
    ext.config.addKeyboardShortcuts as () => Record<string, () => boolean>
  ).call({
    editor,
    type: ext,
    options: ext.options,
    storage: ext.storage,
    parent: undefined,
  } as unknown as ThisParameterType<NonNullable<typeof ext.config.addKeyboardShortcuts>>)
  return shortcuts.Backspace!()
}

// A plugin block that opts into structural indent. The whole point of
// Task 7 is that declaring `indent: { mode: "structural" }` (and NOTHING
// else) makes the block list-classified EVERYWHERE the derived set is
// consulted — split, markdown blank-line spacing, indent keyboard
// behavior — without touching any hardcoded LIST_TYPES set.
const CustomListBlock = createBlockSpec({
  type: "customList",
  content: "inline*",
  indent: { mode: "structural" },
  parseDOM: [{ tag: "li[data-custom-list]" }],
  renderDOM: ({ HTMLAttributes }) => ["li", HTMLAttributes, 0],
  toMarkdown({ prefix, serializeInline, node }) {
    return { line: `${prefix}- ${serializeInline(node)}`, spacing: "list-item" }
  },
})

// A control block with NO structural indent opt-in. The keyboard
// Indent extension must NOT treat it as a list, so the Task-7 swap
// (`isStructuralIndentType`) is what distinguishes the two.
const PlainBlock = createBlockSpec({
  type: "plainBlock",
  content: "inline*",
  parseDOM: [{ tag: "div[data-plain-block]" }],
  renderDOM: ({ HTMLAttributes }) => ["div", HTMLAttributes, 0],
})

function block(
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

function createEditor(content: JSONContent[]) {
  return createTestEditor({
    kit: {
      plugins: [
        {
          id: "custom-list-fixture",
          blockExtensions: [CustomListBlock, PlainBlock],
        },
      ],
    },
    content: { type: "doc", content },
  })
}

describe("derived structural-indent (list) classification", () => {
  it("treats a custom structural block as a list in markdown blank-line spacing", () => {
    // Two consecutive custom-list items get NO blank line between them
    // (list spacing), exactly like built-in bullets. A paragraph after
    // gets a blank line.
    const editor = createEditor([
      block("customList", "one"),
      block("customList", "two"),
      block("paragraph", "after"),
    ])

    expect(exportMarkdown(editor)).toBe("- one\n- two\n\nafter\n")
  })

  it("splits a custom structural block into a same-kind sibling (splitListBlock path)", () => {
    const editor = createEditor([block("customList", "abc")])

    // Place caret at end of the single custom-list item.
    const { doc } = editor.state
    const pos = doc.content.size - 1
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    )

    expect(editor.commands.splitListBlock()).toBe(true)

    // Split produced a second same-kind sibling carrying the suffix —
    // PM's default splitBlock would have fallen back to `paragraph`.
    const types: string[] = []
    editor.state.doc.forEach((node) => types.push(node.type.name))
    expect(types).toEqual(["customList", "customList"])
  })

  it("does NOT split a non-structural block via splitListBlock", () => {
    const editor = createEditor([block("paragraph", "abc")])
    const pos = editor.state.doc.content.size - 1
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    )

    expect(editor.commands.splitListBlock()).toBe(false)
  })

  it("Backspace at the start of an empty custom structural block exits the list (indent keyboard path)", () => {
    // The keyboard `Indent` extension's Backspace handler calls
    // `isStructuralIndentType(editor, name)`. For a structural block it
    // takes the "exit the list" branch: an empty depth-0 item converts
    // to a paragraph and the handler returns true. This is the REAL
    // Task-7 swap in the indent area, not the pre-existing
    // `resolveIndentConfig` path that `indentBlock` reads.
    const editor = createEditor([block("customList", "")])
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)),
    )

    expect(pressIndentBackspace(editor)).toBe(true)
    expect(editor.state.doc.child(0).type.name).toBe("paragraph")
  })

  it("Backspace at the start of an empty NON-structural block does NOT exit (control)", () => {
    // Same gesture on a block that did NOT opt into structural indent.
    // `isStructuralIndentType` returns false, so the exit-list branch is
    // skipped and (depth 0) the handler declines (returns false, no
    // conversion) — proving the derived classification, not the gesture
    // alone, drives the keyboard behavior.
    const editor = createEditor([block("plainBlock", "")])
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)),
    )

    expect(pressIndentBackspace(editor)).toBe(false)
    expect(editor.state.doc.child(0).type.name).toBe("plainBlock")
  })
})
