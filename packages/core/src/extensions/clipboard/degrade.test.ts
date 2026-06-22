// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { degradeToParagraphs } from "./degrade"

const KNOWN = new Set(["p", "h2", "h3", "h4", "hr"])

function fixture(html: string): Element {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  return doc.body.firstElementChild!
}

function emit(html: string): string {
  const out = degradeToParagraphs(fixture(html), KNOWN)
  return out.map((el) => el.outerHTML).join("")
}

describe("degradeToParagraphs", () => {
  it("table with 4 cells → 4 paragraphs (deepest-only)", () => {
    expect(emit("<table><tr><td>a</td><td>b</td><td>c</td><td>d</td></tr></table>"))
      .toBe("<p>a</p><p>b</p><p>c</p><p>d</p>")
  })

  it("ul with 3 items → 3 paragraphs", () => {
    expect(emit("<ul><li>a</li><li>b</li><li>c</li></ul>"))
      .toBe("<p>a</p><p>b</p><p>c</p>")
  })

  it("Notion <div data-block-id><h2>T</h2></div> preserves the H2 (regression guard)", () => {
    expect(emit('<div data-block-id="x"><h2>T</h2></div>'))
      .toBe('<h2>T</h2>')
  })

  it("blockquote wrapping known <p> defers to the <p>", () => {
    expect(emit("<blockquote><p>foo</p></blockquote>"))
      .toBe("<p>foo</p>")
  })

  it("unknown wrapper with inline marks: marks survive via innerHTML", () => {
    // Wrap the <td> in <table><tr> so the HTML parser keeps the cell —
    // an orphan <td> outside a table is silently dropped by the browser.
    expect(emit("<table><tr><td>foo <strong>bar</strong></td></tr></table>"))
      .toBe("<p>foo <strong>bar</strong></p>")
  })

  it("nested div in div in div (no block descendants) emits one paragraph", () => {
    expect(emit("<div><div><div>text</div></div></div>"))
      .toBe("<p>text</p>")
  })

  it("filters whitespace-only paragraphs (handles &nbsp;)", () => {
    expect(emit("<div> </div>")).toBe("")
    expect(emit("<div>  \n  </div>")).toBe("")
  })

  it("returns [] for empty unknown subtree", () => {
    expect(emit("<div></div>")).toBe("")
  })

  it("multiple block-like siblings produce multiple paragraphs", () => {
    expect(emit("<table><tr><td>a</td></tr><tr><td>b</td></tr></table>"))
      .toBe("<p>a</p><p>b</p>")
  })
})
