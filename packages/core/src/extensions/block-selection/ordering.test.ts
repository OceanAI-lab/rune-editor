// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { History } from "@tiptap/extension-history"
import { Paragraph, Heading } from "../../blocks"
import { BlockId } from "../block-id"
import { BlockSelection } from "./index"

describe("BlockSelection / BlockId ordering", () => {
  it("every top-level block has a non-null data-id after initial mount", () => {
    const element = document.createElement("div")
    document.body.appendChild(element)
    const editor = new Editor({
      element,
      extensions: [Document, Text, Paragraph, Heading, History, BlockId, BlockSelection],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "A" }] },
          { type: "paragraph", content: [{ type: "text", text: "B" }] },
        ],
      },
    })
    const ids: Array<string | null> = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "paragraph") {
        ids.push((node.attrs.id as string | null) ?? null)
      }
      return true
    })
    expect(ids).toHaveLength(2)
    expect(ids.every((x) => x !== null && x !== "")).toBe(true)
    editor.destroy()
    element.remove()
  })
})
