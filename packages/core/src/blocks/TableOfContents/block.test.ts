// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { createTestEditor } from "../../test-utils/createTestEditor"

describe("TableOfContents block — schema shape", () => {
  it("registers as group:'block', leaf atom", () => {
    const editor = createTestEditor()
    const t = editor.schema.nodes.tableOfContents
    expect(t).toBeDefined()
    expect(t!.spec.group).toBe("block")
    expect(t!.isAtom).toBe(true)
    expect(t!.isLeaf).toBe(true)
  })

  it("declares id + depth attrs from the factory", () => {
    const editor = createTestEditor()
    const attrs = editor.schema.nodes.tableOfContents!.spec.attrs!
    expect(attrs).toHaveProperty("id")
    expect(attrs).toHaveProperty("depth")
  })

  it("BlockId fills the id attr on insertion", () => {
    const editor = createTestEditor({
      content: { type: "doc", content: [{ type: "tableOfContents" }] },
    })
    const node = editor.state.doc.firstChild
    expect(node?.type.name).toBe("tableOfContents")
    expect(typeof node?.attrs.id).toBe("string")
    expect((node?.attrs.id as string).length).toBeGreaterThan(0)
  })
})

describe("TableOfContents block — DOM I/O", () => {
  it("renderDOM emits .rune-block > .rune-block-content[data-rune-toc]", () => {
    const editor = createTestEditor({
      content: { type: "doc", content: [{ type: "tableOfContents" }] },
    })
    const outer = editor.view.dom.querySelector<HTMLElement>(".rune-block")
    expect(outer).not.toBeNull()
    const inner = outer!.querySelector<HTMLElement>(".rune-block-content")
    expect(inner).not.toBeNull()
    expect(inner!.getAttribute("data-rune-toc")).toBe("")
  })

  it("parseDOM accepts <div data-rune-toc> via setContent HTML", () => {
    const editor = createTestEditor({
      content: '<div data-rune-toc=""></div>',
    })
    const first = editor.state.doc.firstChild
    expect(first?.type.name).toBe("tableOfContents")
  })

  it("getJSON returns a single tableOfContents node with id + depth", () => {
    const editor = createTestEditor({
      content: { type: "doc", content: [{ type: "tableOfContents" }] },
    })
    const json = editor.getJSON()
    expect(json.content).toHaveLength(1)
    const first = json.content![0]!
    expect(first.type).toBe("tableOfContents")
    expect(first.attrs).toHaveProperty("id")
    expect(first.attrs).toHaveProperty("depth", 0)
  })
})

describe("TableOfContents block — slash menu", () => {
  it("exposes an item with title, aliases, and Basic blocks group", () => {
    const editor = createTestEditor()
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "tableOfContents",
    )
    expect(ext).toBeDefined()
    type SlashItem = { key: string; title: string; aliases: string[]; group: string }
    type SpecStorage = {
      slashMenuItems?: (editor: unknown) => SlashItem[]
    }
    const slashItems = (ext as unknown as { storage: SpecStorage }).storage.slashMenuItems?.(editor)
    expect(slashItems).toBeDefined()
    expect(slashItems).toHaveLength(1)
    const item = slashItems![0]!
    expect(item.key).toBe("tableOfContents")
    expect(item.title).toBe("Table of contents")
    expect(item.aliases).toEqual(["toc", "table of contents", "outline"])
    expect(item.group).toBe("Basic blocks")
  })
})
