// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import { createTestEditor } from "../test-utils/createTestEditor"
import { getBlockOutline } from "./queries/blockSnapshots"
import type { RuneBlockInput } from "./types"
import { setBlockColor } from "./blockColor"

function seed(html = "<p>hello</p>"): Editor {
  const editor = createTestEditor()
  editor.commands.setContent(html)
  return editor
}

function firstBlockId(editor: Editor): string {
  return getBlockOutline(editor)[0]!.id
}

function attrAt(editor: Editor, blockId: string, attr: string): unknown {
  let value: unknown
  editor.state.doc.descendants((node) => {
    if (node.attrs.id === blockId) value = node.attrs[attr]
    return value === undefined
  })
  return value
}

describe("setBlockColor", () => {
  it("sets a block text colour by id", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    const res = setBlockColor(editor, { blockId: id, kind: "text", name: "blue" })
    expect(res.ok).toBe(true)
    expect(attrAt(editor, id, "textColor")).toBe("blue")
  })

  it("sets a block background colour by id", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    const res = setBlockColor(editor, { blockId: id, kind: "background", name: "red" })
    expect(res.ok).toBe(true)
    expect(attrAt(editor, id, "backgroundColor")).toBe("red")
  })

  it('clears the colour with name "default" (stored as null)', () => {
    const editor = seed()
    const id = firstBlockId(editor)
    setBlockColor(editor, { blockId: id, kind: "text", name: "blue" })
    const res = setBlockColor(editor, { blockId: id, kind: "text", name: "default" })
    expect(res.ok).toBe(true)
    expect(attrAt(editor, id, "textColor")).toBeNull()
  })

  it("is one undo step", () => {
    const editor = seed()
    const id = firstBlockId(editor)
    setBlockColor(editor, { blockId: id, kind: "text", name: "blue" })
    expect(attrAt(editor, id, "textColor")).toBe("blue")
    editor.commands.undo()
    expect(attrAt(editor, id, "textColor")).toBeNull()
  })

  describe("error gating", () => {
    it("unknown colour name -> invalid-input", () => {
      const editor = seed()
      const res = setBlockColor(editor, {
        blockId: firstBlockId(editor),
        kind: "text",
        // @ts-expect-error intentionally invalid name for the runtime guard
        name: "chartreuse",
      })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("invalid-input")
    })

    it("missing block -> not-found", () => {
      const editor = seed()
      const res = setBlockColor(editor, { blockId: "nope", kind: "text", name: "blue" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("not-found")
    })

    it("block that does not support the colour kind -> unsupported", () => {
      const editor = seed()
      editor.commands.insertBlocks([{ type: "divider" }], { at: "end" })
      const dividerId = getBlockOutline(editor).find((b) => b.type === "divider")!.id
      const res = setBlockColor(editor, { blockId: dividerId, kind: "text", name: "blue" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("unsupported")
    })

    it("gates on DECLARED supports, not raw attr presence (image: bg yes, text no)", () => {
      const editor = seed()
      editor.commands.insertBlocks([{ type: "image" } as unknown as RuneBlockInput], {
        at: "end",
      })
      const imageId = getBlockOutline(editor).find((b) => b.type === "image")!.id
      // Image declares { backgroundColor: true } only, yet deriveBlockColorTypes
      // gives it a textColor attr too — the tool must still refuse text colour.
      const textRes = setBlockColor(editor, { blockId: imageId, kind: "text", name: "blue" })
      expect(textRes.ok).toBe(false)
      if (!textRes.ok) expect(textRes.error.code).toBe("unsupported")
      const bgRes = setBlockColor(editor, { blockId: imageId, kind: "background", name: "blue" })
      expect(bgRes.ok).toBe(true)
    })

    it("readonly editor -> not-editable", () => {
      const editor = seed()
      const id = firstBlockId(editor)
      editor.setEditable(false)
      const res = setBlockColor(editor, { blockId: id, kind: "text", name: "blue" })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe("not-editable")
    })
  })
})
