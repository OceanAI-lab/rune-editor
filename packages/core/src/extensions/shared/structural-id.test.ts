// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import { EditorState } from "@tiptap/pm/state"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Paragraph } from "../../blocks"
import { createRuneKit } from "../../kit"
import { computeIdPatches, buildBackfillTransaction } from "./structural-id"
import { INTERNAL_NORMALIZATION_META } from "../internal-meta"

// The shared backfill is parameterized by { attrName, nodePredicate,
// generateId }. These tests drive it through the `paragraph` body block
// using a CUSTOM attr/predicate/generator (distinct from block-id's
// defaults) to prove the parameterization, exercise collision handling,
// and the no-op path.

function makeEditor(content: unknown) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [Document, Text, Paragraph],
    content: content as never,
  })
}

let counter = 0
const generateId = () => `gen_${(counter += 1)}`

const config = {
  attrName: "id" as const,
  nodePredicate: (node: { type: { name: string } }) =>
    node.type.name === "paragraph",
  generateId,
}

describe("structural-id shared backfill", () => {
  it("backfills ids for nodes matching the predicate (null → generated)", () => {
    counter = 0
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    })
    const patches = computeIdPatches(editor.state, config)
    expect(patches).toHaveLength(2)
    const tr = buildBackfillTransaction(editor.state, patches, config)
    expect(tr).not.toBeNull()
    editor.view.dispatch(tr!)

    const ids: Array<string | null> = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "paragraph") ids.push(node.attrs.id as string)
      return true
    })
    expect(ids).toEqual(["gen_1", "gen_2"])
    editor.destroy()
  })

  it("preserves an existing unique id and regenerates a collision", () => {
    counter = 0
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "keep" }, content: [{ type: "text", text: "a" }] },
        { type: "paragraph", attrs: { id: "dup" }, content: [{ type: "text", text: "b" }] },
        { type: "paragraph", attrs: { id: "dup" }, content: [{ type: "text", text: "c" }] },
      ],
    })
    const patches = computeIdPatches(editor.state, config)
    // Only the second "dup" collides — one patch.
    expect(patches).toHaveLength(1)
    const tr = buildBackfillTransaction(editor.state, patches, config)
    editor.view.dispatch(tr!)

    const ids: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "paragraph") ids.push(node.attrs.id as string)
      return true
    })
    expect(ids[0]).toBe("keep")
    expect(ids[1]).toBe("dup")
    expect(ids[2]).not.toBe("dup")
    expect(new Set(ids).size).toBe(3)
    editor.destroy()
  })

  it("is a no-op when every matching node already has a unique id", () => {
    counter = 0
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "one" }, content: [{ type: "text", text: "a" }] },
        { type: "paragraph", attrs: { id: "two" }, content: [{ type: "text", text: "b" }] },
      ],
    })
    const patches = computeIdPatches(editor.state, config)
    expect(patches).toHaveLength(0)
    const tr = buildBackfillTransaction(editor.state, patches, config)
    expect(tr).toBeNull()
    editor.destroy()
  })

  // setNodeMarkup RE-CREATES the target node and re-validates its content
  // expression. A node that is currently schema-invalid — e.g. an id-less
  // 1-column `columnLayout` (content `column{2,5}`) landed via Node.fromJSON,
  // which does NOT re-fit — used to throw RangeError out of the backfill
  // before normalization could repair it. The backfill must skip such nodes
  // (normalization fixes the shape; the backfill converges next pass).
  // Probed 2026-06-10: tr.setNodeAttribute (AttrStep) throws the identical
  // RangeError — replace's close() re-validates the joined content — so
  // swapping the step type is NOT a fix; skip-on-throw is.
  describe("schema-invalid target nodes", () => {
    /** doc(paragraph, columnLayout(column(paragraph))) — the 1-column layout
     *  violates `column{2,5}`. Built via raw `type.create` (no validation),
     *  state via EditorState.create (no validation either). */
    function invalidLayoutState() {
      const probe = new Editor({ extensions: createRuneKit() })
      const s = probe.schema
      const para = (text: string) =>
        s.nodes.paragraph!.create(null, text ? s.text(text) : undefined)
      const doc = s.nodes.doc!.create(null, [
        para("a"),
        s.nodes.columnLayout!.create(null, [
          s.nodes.column!.create(null, [para("b")]),
        ]),
      ])
      probe.destroy()
      return EditorState.create({ doc })
    }

    it("skips a node whose content re-validation fails and still patches the rest", () => {
      counter = 0
      const state = invalidLayoutState()
      const cfg = {
        attrName: "id" as const,
        nodePredicate: (node: { type: { name: string } }) =>
          node.type.name === "paragraph" || node.type.name === "columnLayout",
        generateId,
      }
      const patches = computeIdPatches(state, cfg)
      // Both root paragraphs + the layout + the in-column paragraph.
      expect(patches.length).toBe(3)
      let tr: ReturnType<typeof buildBackfillTransaction> = null
      expect(() => {
        tr = buildBackfillTransaction(state, patches, cfg)
      }).not.toThrow()
      expect(tr).not.toBeNull()
      const next = state.apply(tr!)
      const ids: Record<string, string | null> = {}
      next.doc.descendants((node) => {
        if (node.type.name === "paragraph") ids[node.textContent] = node.attrs.id
        if (node.type.name === "columnLayout") ids.layout = node.attrs.id
        return true
      })
      // Paragraphs patched; the invalid layout skipped (id stays null).
      expect(ids.a).toMatch(/^gen_/)
      expect(ids.b).toMatch(/^gen_/)
      expect(ids.layout).toBeNull()
    })

    it("returns null (no empty backfill tr) when every patch target is invalid", () => {
      counter = 0
      const state = invalidLayoutState()
      const cfg = {
        attrName: "id" as const,
        nodePredicate: (node: { type: { name: string } }) =>
          node.type.name === "columnLayout",
        generateId,
      }
      const patches = computeIdPatches(state, cfg)
      expect(patches.length).toBe(1)
      let tr: ReturnType<typeof buildBackfillTransaction> = null
      expect(() => {
        tr = buildBackfillTransaction(state, patches, cfg)
      }).not.toThrow()
      expect(tr).toBeNull()
    })
  })

  it("tags the backfill tr with INTERNAL_NORMALIZATION_META + addToHistory=false", () => {
    counter = 0
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
    })
    const patches = computeIdPatches(editor.state, config)
    const tr = buildBackfillTransaction(editor.state, patches, config)
    expect(tr!.getMeta(INTERNAL_NORMALIZATION_META)).toBe(true)
    expect(tr!.getMeta("addToHistory")).toBe(false)
    editor.destroy()
  })
})
