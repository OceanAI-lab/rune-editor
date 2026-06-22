// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { createRuneKit } from "../../kit"
import { insertWouldNestColumnLayout } from "./insertBlocks"
import type { RuneBlockInput } from "../types"

// No-nesting insert guard (Columns Phase 1, Task 3 / Step 3).
//
// Builds a healthy 2-column doc directly from the schema so we have a real
// position INSIDE a column to probe. `insertWouldNestColumnLayout` is the
// insert-time analog of the paste flatten + the appendTransaction safety net;
// it rejects a `columnLayout` input whose resolved destination sits inside a
// `column`, and is forward-wired for Task 5's explicit column targets.

function buildDoc(): { doc: ProseMirrorNode; insideColumnPos: number; rootEndPos: number } {
  const editor = new Editor({ extensions: createRuneKit() })
  const s = editor.schema
  const para = (t: string) =>
    s.nodes.paragraph!.create({ id: null, depth: 0 }, s.text(t))
  const col = (id: string, t: string) =>
    s.nodes.column!.create({ id, width: 1 }, para(t))
  const doc = s.nodes.doc!.create(null, [
    para("before"),
    s.nodes.columnLayout!.create({ id: "lay", depth: 0 }, [
      col("col_a", "A"),
      col("col_b", "B"),
    ]),
  ])
  editor.destroy()

  // Find a boundary position inside column A's paragraph.
  let insideColumnPos = -1
  doc.descendants((node, pos) => {
    if (insideColumnPos < 0 && node.type.name === "paragraph" && node.textContent === "A") {
      insideColumnPos = pos + 1
    }
    return true
  })
  return { doc, insideColumnPos, rootEndPos: doc.content.size }
}

const layoutInput: RuneBlockInput = {
  type: "columnLayout",
  columns: [
    { id: "x", width: 1, children: [] },
    { id: "y", width: 1, children: [] },
  ],
} as unknown as RuneBlockInput

const paragraphInput: RuneBlockInput = {
  type: "paragraph",
  content: [],
} as unknown as RuneBlockInput

describe("insertWouldNestColumnLayout (no-nesting insert guard)", () => {
  it("rejects a columnLayout input whose destination sits inside a column", () => {
    const { doc, insideColumnPos } = buildDoc()
    expect(insideColumnPos).toBeGreaterThan(0)
    expect(insertWouldNestColumnLayout(doc, insideColumnPos, [layoutInput])).toBe(true)
  })

  it("allows a columnLayout input at a root boundary", () => {
    const { doc, rootEndPos } = buildDoc()
    expect(insertWouldNestColumnLayout(doc, rootEndPos, [layoutInput])).toBe(false)
  })

  it("allows a non-layout input inside a column (only columnLayout is guarded)", () => {
    const { doc, insideColumnPos } = buildDoc()
    expect(insertWouldNestColumnLayout(doc, insideColumnPos, [paragraphInput])).toBe(false)
  })

  it("returns false for an unresolvable (-1) position", () => {
    const { doc } = buildDoc()
    expect(insertWouldNestColumnLayout(doc, -1, [layoutInput])).toBe(false)
  })
})
