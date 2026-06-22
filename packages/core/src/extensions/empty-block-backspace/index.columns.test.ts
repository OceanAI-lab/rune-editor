// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createTestEditor } from "../../test-utils/createTestEditor"

/**
 * Regression tests for RC-1: `EmptyBlockBackspace` mixed surfaces. `current`
 * was resolved surface-locally (`nearestBodyBlock` → the column child for an
 * in-column caret) but `prev` was still a ROOT walk (`$from.node(0).child(
 * $from.index(0) - 1)` — the root block before the whole `columnLayout`).
 * Both blocks must resolve on the SAME surface.
 */

type Ed = ReturnType<typeof createTestEditor>

/**
 * Dispatch a REAL keydown through the view (the Toggle plugin.test.ts
 * pattern). `editor.commands.keyboardShortcut` captures the handler's
 * transaction and replays only its STEPS onto the command transaction —
 * the `setSelection` this extension dispatches is dropped, so caret
 * assertions would test the capture quirk, not the extension.
 */
function pressBackspace(editor: Ed): void {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    }),
  )
}

function columns(editor: Ed): ProseMirrorNode[] {
  const out: ProseMirrorNode[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === "column") out.push(node)
    return true
  })
  return out
}

function childTypes(node: ProseMirrorNode): string[] {
  const out: string[] = []
  node.forEach((child) => out.push(child.type.name))
  return out
}

/** Index of the column the caret sits in (among the layout's columns), or -1. */
function caretColumnIndex(editor: Ed): number {
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "column") return $from.index(d - 1)
  }
  return -1
}

describe("EmptyBlockBackspace — column surfaces (RC-1)", () => {
  it("fixture (a): caret in a column's sole empty paragraph — does NOT fire against the root block before the layout", () => {
    // doc = [empty root para, layout[colA[sole empty para CARET], colB["B1"]]]
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "paragraph" },
          {
            type: "columnLayout",
            content: [
              { type: "column", content: [{ type: "paragraph" }] },
              {
                type: "column",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "B1" }],
                  },
                ],
              },
            ],
          },
        ],
      } as never,
    })

    // caret at the start (and only position) of colA's empty paragraph
    editor.commands.setTextSelection(5)
    expect(caretColumnIndex(editor)).toBe(0) // sanity: caret is in colA
    const colAParaIdBefore = columns(editor)[0]!.child(0).attrs.id as
      | string
      | null

    pressBackspace(editor)

    // The extension must NOT treat the empty ROOT paragraph (before the
    // whole layout) as `prev`. colA is at indexInSurface 0 on the column
    // surface → no previous sibling → extension declines; ColumnsKeyboard's
    // no-op guard consumes the event. Doc shape is unchanged:
    const cols = columns(editor)
    expect(cols).toHaveLength(2)
    expect(childTypes(cols[0]!)).toEqual(["paragraph"])
    expect(cols[0]!.child(0).content.size).toBe(0)
    expect(childTypes(cols[1]!)).toEqual(["paragraph"])
    expect(cols[1]!.child(0).textContent).toBe("B1")

    // No id churn — the buggy path deleted colA's paragraph and let the
    // fitter reseed it with a fresh id.
    expect(cols[0]!.child(0).attrs.id).toBe(colAParaIdBefore)

    // Caret did not teleport across columns into colB.
    expect(caretColumnIndex(editor)).toBe(0)
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
    expect(editor.state.selection.$from.parent.content.size).toBe(0)
  })

  it("fixture (b): empty heading + empty paragraph pair INSIDE a column — symmetric protection fires (heading survives)", () => {
    // doc = [filled root para, layout[colA[empty h2, empty para CARET], colB["B1"]]]
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "fill" }] },
          {
            type: "columnLayout",
            content: [
              {
                type: "column",
                content: [
                  { type: "heading", attrs: { level: 2 } },
                  { type: "paragraph" },
                ],
              },
              {
                type: "column",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "B1" }],
                  },
                ],
              },
            ],
          },
        ],
      } as never,
    })

    // caret at the start of colA's empty trailing paragraph
    editor.commands.setTextSelection(11)
    expect(caretColumnIndex(editor)).toBe(0) // sanity: caret is in colA
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")

    pressBackspace(editor)

    // The buggy gate tested the filled ROOT paragraph as `prev` and bailed,
    // letting PM's joinBackward delete the empty HEADING — the inverse of
    // what this extension exists to guarantee. Correct: the surface-local
    // prev is the empty heading, so the CURRENT empty paragraph dies and
    // the heading survives with the caret inside it.
    const cols = columns(editor)
    expect(cols).toHaveLength(2)
    expect(childTypes(cols[0]!)).toEqual(["heading"])
    expect(cols[0]!.child(0).content.size).toBe(0)
    expect(editor.state.selection.$from.parent.type.name).toBe("heading")

    // The untouched root paragraph and colB stay intact.
    expect(editor.state.doc.child(0).textContent).toBe("fill")
    expect(cols[1]!.child(0).textContent).toBe("B1")
  })
})
