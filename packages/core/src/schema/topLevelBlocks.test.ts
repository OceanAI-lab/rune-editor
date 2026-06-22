// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { Fragment } from "@tiptap/pm/model"

import { Heading } from "../blocks/Heading/block"
import { Paragraph } from "../blocks/Paragraph/block"
import {
  topLevelBlockEndPos,
  topLevelBlockIndexAtBoundaryPos,
  topLevelBlockIndexById,
  topLevelBlockPosById,
  topLevelBlockStartPosBefore,
  topLevelBlockStartPos,
  topLevelBlockTextBounds,
  topLevelBlockTextBoundsAtPos,
} from "./topLevelBlocks"

function mkDoc() {
  const editor = new Editor({
    extensions: [Document, Text, Paragraph, Heading],
    content:
      '<p data-id="first">one</p><h2 data-id="middle">two</h2><p data-id="last">three</p>',
  })
  return {
    doc: editor.state.doc,
    destroy: () => editor.destroy(),
  }
}

describe("topLevelBlocks", () => {
  it("finds top-level indices and boundary positions", () => {
    const { doc, destroy } = mkDoc()
    try {
      expect(topLevelBlockIndexById(doc, "first")).toBe(0)
      expect(topLevelBlockIndexById(doc, "middle")).toBe(1)
      expect(topLevelBlockIndexById(doc, "last")).toBe(2)
      expect(topLevelBlockIndexById(doc, "missing")).toBe(-1)

      expect(topLevelBlockPosById(doc, "first")).toBe(0)
      expect(topLevelBlockPosById(doc, "middle")).toBe(5)
      expect(topLevelBlockPosById(doc, "last")).toBe(10)
      expect(topLevelBlockPosById(doc, "missing")).toBe(-1)

      expect(topLevelBlockIndexAtBoundaryPos(doc, 0)).toBe(0)
      expect(topLevelBlockIndexAtBoundaryPos(doc, 5)).toBe(1)
      expect(topLevelBlockIndexAtBoundaryPos(doc, 10)).toBe(2)
      expect(topLevelBlockIndexAtBoundaryPos(doc, doc.content.size)).toBe(3)
      expect(topLevelBlockIndexAtBoundaryPos(doc, 1)).toBe(-1)

      expect(topLevelBlockStartPosBefore(doc, 0)).toBe(-1)
      expect(topLevelBlockStartPosBefore(doc, 5)).toBe(0)
      expect(topLevelBlockStartPosBefore(doc, 10)).toBe(5)
      expect(topLevelBlockStartPosBefore(doc, doc.content.size)).toBe(10)
      expect(topLevelBlockStartPosBefore(doc, 1)).toBe(-1)
    } finally {
      destroy()
    }
  })

  it("reports start, end, and text bounds for valid top-level indices", () => {
    const { doc, destroy } = mkDoc()
    try {
      expect(topLevelBlockStartPos(doc, 0)).toBe(0)
      expect(topLevelBlockEndPos(doc, 0)).toBe(5)
      expect(topLevelBlockTextBounds(doc, 0)).toEqual({ from: 1, to: 4 })

      expect(topLevelBlockStartPos(doc, 1)).toBe(5)
      expect(topLevelBlockEndPos(doc, 1)).toBe(10)
      expect(topLevelBlockTextBounds(doc, 1)).toEqual({ from: 6, to: 9 })

      expect(topLevelBlockStartPos(doc, 2)).toBe(10)
      expect(topLevelBlockEndPos(doc, 2)).toBe(17)
      expect(topLevelBlockTextBounds(doc, 2)).toEqual({ from: 11, to: 16 })
    } finally {
      destroy()
    }
  })

  it("resolves text bounds from boundary positions", () => {
    const { doc, destroy } = mkDoc()
    try {
      expect(topLevelBlockTextBoundsAtPos(doc, 2)).toEqual({ index: 0, from: 1, to: 4 })
      expect(topLevelBlockTextBoundsAtPos(doc, 7)).toEqual({ index: 1, from: 6, to: 9 })
      expect(topLevelBlockTextBoundsAtPos(doc, 12)).toEqual({ index: 2, from: 11, to: 16 })
      expect(topLevelBlockTextBoundsAtPos(doc, 0)).toBeNull()
      expect(topLevelBlockTextBoundsAtPos(doc, -1)).toBeNull()
    } finally {
      destroy()
    }
  })

  it("handles empty docs via Fragment.empty", () => {
    const editor = new Editor({
      extensions: [Document, Text, Paragraph],
    })
    const doc = editor.state.schema.topNodeType.create(null, Fragment.empty)
    try {
      expect(topLevelBlockIndexById(doc, "missing")).toBe(-1)
      expect(topLevelBlockIndexAtBoundaryPos(doc, 0)).toBe(0)
      expect(topLevelBlockTextBoundsAtPos(doc, 0)).toBeNull()
    } finally {
      editor.destroy()
    }
  })
})
