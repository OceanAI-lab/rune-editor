// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createTestEditor } from "../../test-utils/createTestEditor"
import { getDocument } from "../queries"
import type { RuneColumnsBlock } from "../../blocks/Columns/block"

// COL-2 regression suite — `turnInto` × `columnLayout` (both directions).
//
// Before the fix, `classifyKind` special-cased only `table` as "container",
// so `columnLayout` classified as "inline":
//   (a) paragraph → columnLayout returned true and SILENTLY DELETED the
//       block (unchecked `.create(attrs, inlineContent)` built an invalid
//       layout; normalization's unwrap rule saw 0 column children and
//       removed it), and
//   (b) columnLayout → paragraph returned true and PERSISTED a schema-
//       invalid doc (`doc.check()` threw "Invalid content for node
//       paragraph").

/** The exact props shape the `columns_2` slash item carries. */
function twoColumnsProps(): Record<string, unknown> {
  return {
    columns: [
      { width: 1, children: [] },
      { width: 1, children: [] },
    ],
  }
}

/**
 * Doc shape (same as columnTargets.test.ts):
 *   paragraph "root-1"  (id r1)
 *   columnLayout (id lay)
 *     column col_a: paragraph "A1" (a1)
 *     column col_b: paragraph "B1" (b1)
 */
function makeLayoutFixture(): { editor: Editor } {
  const editor = createTestEditor({ kit: { suggestionMenus: false } })
  const s = editor.schema
  const para = (id: string, t: string) =>
    s.nodes.paragraph!.create({ id, depth: 0 }, s.text(t))
  const col = (id: string, ...children: ProseMirrorNode[]) =>
    s.nodes.column!.create({ id, width: 1 }, children)
  const doc = s.nodes.doc!.create(null, [
    para("r1", "root-1"),
    s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
      col("col_a", para("a1", "A1")),
      col("col_b", para("b1", "B1")),
    ]),
    para("r2", "root-2"),
  ])
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content),
  )
  return { editor }
}

describe("turnInto — paragraph to columnLayout (container target)", () => {
  it("converts and seeds the source's content into column 1 (no silent delete)", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    editor.commands.setContent([
      {
        type: "paragraph",
        attrs: { id: "p1" },
        content: [{ type: "text", text: "Hello" }],
      },
    ])

    const ok = editor.commands.turnInto("p1", {
      type: "columnLayout",
      props: twoColumnsProps(),
    })

    expect(ok).toBe(true)
    expect(() => editor.state.doc.check()).not.toThrow()
    const layout = getDocument(editor).find(
      (b): b is RuneColumnsBlock => b.type === "columnLayout",
    )
    expect(layout).toBeDefined()
    expect(layout!.id).toBe("p1")
    expect(layout!.columns).toHaveLength(2)
    // The source's text landed in column 1 — the bug deleted it outright.
    const layoutNode = editor.state.doc.child(0)
    expect(layoutNode.type.name).toBe("columnLayout")
    expect(layoutNode.child(0).textContent).toBe("Hello")
    expect(layoutNode.child(1).textContent).toBe("")
  })

  it("simulating the slash-menu Turn-into commit ('Hello /2' → 2 columns) keeps Hello", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    editor.commands.setContent([
      {
        type: "paragraph",
        attrs: { id: "p1" },
        content: [{ type: "text", text: "Hello /2" }],
      },
    ])

    // The trigger range covers "/2" — text starts at pos 1, "Hello " is 6
    // chars, so the "/" sits at pos 7 and the range is [7, 9].
    const ok = editor
      .chain()
      .deleteRange({ from: 7, to: 9 })
      .turnInto("p1", { type: "columnLayout", props: twoColumnsProps() })
      .run()

    expect(ok).toBe(true)
    expect(() => editor.state.doc.check()).not.toThrow()
    const layoutNode = editor.state.doc.child(0)
    expect(layoutNode.type.name).toBe("columnLayout")
    expect(layoutNode.childCount).toBe(2)
    expect(layoutNode.child(0).textContent).toBe("Hello ")
  })

  it("refuses a columnLayout target without a columns payload (returns false, doc intact)", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    editor.commands.setContent([
      {
        type: "paragraph",
        attrs: { id: "p1" },
        content: [{ type: "text", text: "Hello" }],
      },
    ])
    const before = editor.state.doc.toJSON()

    const ok = editor.commands.turnInto("p1", { type: "columnLayout" })

    expect(ok).toBe(false)
    expect(() => editor.state.doc.check()).not.toThrow()
    expect(editor.state.doc.toJSON()).toEqual(before)
  })

  it("refuses turnInto to columnLayout from inside a column (no nested layouts)", () => {
    const { editor } = makeLayoutFixture()

    const ok = editor.commands.turnInto("a1", {
      type: "columnLayout",
      props: twoColumnsProps(),
    })

    expect(ok).toBe(false)
    expect(() => editor.state.doc.check()).not.toThrow()
    // Column A's child is untouched.
    const layout = getDocument(editor).find(
      (b): b is RuneColumnsBlock => b.type === "columnLayout",
    )
    expect(layout!.columns[0]!.children.map((c) => c.id)).toEqual(["a1"])
  })
})

describe("turnInto — columnLayout as source (container source refusal)", () => {
  it("refuses layout → paragraph and keeps the doc schema-valid", () => {
    const { editor } = makeLayoutFixture()

    const ok = editor.commands.turnInto("lay", { type: "paragraph" })

    expect(ok).toBe(false)
    expect(() => editor.state.doc.check()).not.toThrow()
    expect(getDocument(editor).map((b) => b.type)).toEqual([
      "paragraph",
      "columnLayout",
      "paragraph",
    ])
  })

  it("skips a layout source inside a multi-id target (like the table precedent)", () => {
    const { editor } = makeLayoutFixture()

    const ok = editor.commands.turnInto(["r1", "lay"], {
      type: "heading",
      props: { level: 2 },
    })

    expect(ok).toBe(true)
    expect(() => editor.state.doc.check()).not.toThrow()
    expect(editor.state.doc.child(0).type.name).toBe("heading")
    expect(editor.state.doc.child(1).type.name).toBe("columnLayout")
  })
})

// AR-1 regression — the belt-and-braces validContent guard must not refuse
// everyday paragraph → codeBlock conversions. codeBlock content is `text*`,
// so hardBreak / inline atoms are flattened to plain text first; only a
// still-invalid result refuses. (The non-code refusal path stays pinned at
// the adapter level in turnIntoAdapters.test.ts.)
describe("turnInto — code-target content flattening (AR-1)", () => {
  it("converts a soft-wrapped paragraph to codeBlock with hardBreak as newline", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    editor.commands.setContent([
      {
        type: "paragraph",
        attrs: { id: "p1" },
        content: [
          { type: "text", text: "line one" },
          { type: "hardBreak" },
          { type: "text", text: "line two" },
        ],
      },
    ])

    const ok = editor.commands.turnInto("p1", { type: "codeBlock" })

    expect(ok).toBe(true)
    expect(() => editor.state.doc.check()).not.toThrow()
    const block = editor.state.doc.child(0)
    expect(block.type.name).toBe("codeBlock")
    expect(block.textContent).toBe("line one\nline two")
  })

  it("converts a paragraph with inlineMath to codeBlock, carrying the latex as text", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    editor.commands.setContent([
      {
        type: "paragraph",
        attrs: { id: "p1" },
        content: [{ type: "inlineMath", attrs: { latex: "x^2" } }],
      },
    ])

    const ok = editor.commands.turnInto("p1", { type: "codeBlock" })

    expect(ok).toBe(true)
    expect(() => editor.state.doc.check()).not.toThrow()
    const block = editor.state.doc.child(0)
    expect(block.type.name).toBe("codeBlock")
    expect(block.textContent).toBe("x^2")
  })

  it("converts a marked-up paragraph to codeBlock with marks dropped", () => {
    const editor = createTestEditor({ kit: { suggestionMenus: false } })
    editor.commands.setContent([
      {
        type: "paragraph",
        attrs: { id: "p1" },
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "bold " },
          { type: "text", text: "plain" },
        ],
      },
    ])

    const ok = editor.commands.turnInto("p1", { type: "codeBlock" })

    expect(ok).toBe(true)
    expect(() => editor.state.doc.check()).not.toThrow()
    const block = editor.state.doc.child(0)
    expect(block.type.name).toBe("codeBlock")
    expect(block.textContent).toBe("bold plain")
    block.descendants((child) => {
      expect(child.marks.length).toBe(0)
    })
  })
})
