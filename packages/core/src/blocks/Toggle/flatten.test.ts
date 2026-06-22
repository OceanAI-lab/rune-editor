// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest"
import { transformToggleHTML } from "./flatten"

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

describe("transformToggleHTML — <details>", () => {
  it("flattens a <details> into title + body siblings with data-rune-paste-depth", () => {
    const doc = parse(`
      <details open>
        <summary>Title</summary>
        <p>Body A</p>
        <p>Body B</p>
      </details>
    `)
    transformToggleHTML(doc)
    const tops = Array.from(doc.body.children)
    expect(tops[0]!.getAttribute("data-rune-toggle-title")).toBe("1")
    expect(tops[0]!.getAttribute("data-rune-toggle-expanded")).toBe("true")
    expect(tops[0]!.textContent).toBe("Title")
    expect(tops[1]!.getAttribute("data-rune-paste-depth")).toBe("1")
    expect(tops[1]!.textContent).toBe("Body A")
    expect(tops[2]!.getAttribute("data-rune-paste-depth")).toBe("1")
    expect(tops[2]!.textContent).toBe("Body B")
  })

  it("preserves heading level from <summary><hN>", () => {
    const doc = parse(`
      <details>
        <summary><h2>Title</h2></summary>
        <p>Body</p>
      </details>
    `)
    transformToggleHTML(doc)
    const t = doc.body.firstElementChild!
    expect(t.tagName).toBe("H2")
    expect(t.getAttribute("data-rune-toggle-level")).toBe("2")
    expect(t.getAttribute("data-rune-toggle-expanded")).toBe("false")
  })

  it("flattens nested <details> recursively, incrementing depth", () => {
    const doc = parse(`
      <details open>
        <summary>Outer</summary>
        <details open>
          <summary>Inner</summary>
          <p>Deep</p>
        </details>
        <p>OuterBody</p>
      </details>
    `)
    transformToggleHTML(doc)
    const tops = Array.from(doc.body.children) as HTMLElement[]
    // outer title, inner title (depth 1), deep (depth 2), outer body (depth 1)
    expect(tops[0]!.textContent).toBe("Outer")
    expect(tops[0]!.getAttribute("data-rune-toggle-title")).toBe("1")
    expect(tops[1]!.textContent).toBe("Inner")
    expect(tops[1]!.getAttribute("data-rune-paste-depth")).toBe("1")
    expect(tops[1]!.getAttribute("data-rune-toggle-title")).toBe("1")
    expect(tops[2]!.textContent).toBe("Deep")
    expect(tops[2]!.getAttribute("data-rune-paste-depth")).toBe("2")
    expect(tops[3]!.textContent).toBe("OuterBody")
    expect(tops[3]!.getAttribute("data-rune-paste-depth")).toBe("1")
  })
})

describe("transformToggleHTML — Notion", () => {
  it("flattens a Notion toggle-header with <h2> summary", () => {
    const doc = parse(`
      <div class="notion-selectable notion-header-block">
        <div aria-expanded="true">
          <h2 aria-roledescription="heading level 1">Section</h2>
          <div>
            <p>Body</p>
          </div>
        </div>
      </div>
    `)
    transformToggleHTML(doc)
    const tops = Array.from(doc.body.children) as HTMLElement[]
    expect(tops[0]!.tagName).toBe("H2")
    expect(tops[0]!.getAttribute("data-rune-toggle-title")).toBe("1")
    expect(tops[0]!.getAttribute("data-rune-toggle-level")).toBe("2")
    expect(tops[1]!.getAttribute("data-rune-paste-depth")).toBe("1")
    expect(tops[1]!.textContent).toBe("Body")
  })
})
