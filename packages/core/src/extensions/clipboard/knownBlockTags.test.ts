// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { Editor, Node } from "@tiptap/core"
import { createRuneKit as kit } from "../../kit"
import { collectKnownBlockTags } from "./knownBlockTags"

function withSchema(extras: any[] = []) {
  const editor = new Editor({
    extensions: [...kit(), ...extras],
    element: document.createElement("div"),
  })
  const tags = collectKnownBlockTags(editor.schema)
  editor.destroy()
  return tags
}

describe("collectKnownBlockTags", () => {
  it("includes default kit blocks (p, h2, h3, h4, hr, ul, ol)", () => {
    const tags = withSchema()
    expect(tags.has("p")).toBe(true)
    expect(tags.has("h2")).toBe(true)
    expect(tags.has("h3")).toBe(true)
    expect(tags.has("h4")).toBe(true)
    expect(tags.has("hr")).toBe(true)
    expect(tags.has("ul")).toBe(true)
    expect(tags.has("ol")).toBe(true)
  })

  it("includes custom block declared via parseDOM tag", () => {
    const Foo = Node.create({
      name: "fooblock",
      group: "block",
      content: "inline*",
      parseHTML: () => [{ tag: "foo-block" }],
      renderHTML: () => ["foo-block", 0],
    })
    expect(withSchema([Foo]).has("foo-block")).toBe(true)
  })

  it("rejects narrowed selectors so the bare tag doesn't leak", () => {
    // `div[data-type=callout]` only matches divs that carry that attr.
    // Treating ALL `<div>` as schema-known would let unrelated wrappers
    // (e.g. Notion's `<div data-block-id="…">`) survive paste — the
    // narrow rule still applies downstream via PM's DOMParser.
    const Callout = Node.create({
      name: "callout",
      group: "block",
      content: "inline*",
      parseHTML: () => [{ tag: "div[data-type=callout]" }],
      renderHTML: () => ["div", { "data-type": "callout" }, 0],
    })
    const tags = withSchema([Callout])
    expect(tags.has("div")).toBe(false)
  })

  it("rejects attribute-only selectors with no leading tag", () => {
    // `[data-rune-toggle-title]` has no leading tag — already excluded
    // by the leading-letter check, but call it out as part of the
    // narrow-selector contract.
    const TitleClaim = Node.create({
      name: "titleclaim",
      group: "block",
      content: "inline*",
      parseHTML: () => [{ tag: "[data-rune-toggle-title]" }],
      renderHTML: () => ["p", { "data-rune-toggle-title": "1" }, 0],
    })
    const tags = withSchema([TitleClaim])
    expect(tags.has("p")).toBe(true) // from Paragraph, not from TitleClaim
    // Nothing else leaked from the bracketed selector.
    expect(tags.has("data-rune-toggle-title")).toBe(false)
  })

  it("keeps the leading tag when the selector uses a combinator", () => {
    // `ul > li` parses the LI but UL is the natural top-level container
    // we want to keep on paste. Combinators (>, +, ~, descendant) don't
    // narrow the tag itself, so the leading tag still counts.
    const Item = Node.create({
      name: "altitem",
      group: "block",
      content: "inline*",
      parseHTML: () => [{ tag: "section li" }],
      renderHTML: () => ["li", 0],
    })
    const tags = withSchema([Item])
    expect(tags.has("section")).toBe(true)
  })

  it("normalizes tag names to lowercase", () => {
    const Up = Node.create({
      name: "upblock",
      group: "block",
      content: "inline*",
      parseHTML: () => [{ tag: "P" }],
      renderHTML: () => ["p", 0],
    })
    expect(withSchema([Up]).has("p")).toBe(true)
  })

  it("excludes inline / non-block nodes (HardBreak)", () => {
    // HardBreak ships in StarterKit (inline, not group:block); its parseDOM is [{tag: 'br'}]
    // — must NOT leak into the white-list set.
    const tags = withSchema()
    expect(tags.has("br")).toBe(false)
  })
})
