// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it, beforeEach } from "vitest"
import { parseQueryBlockLink } from "./parse"

describe("parseQueryBlockLink", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/editor?doc=current")
  })

  it("parses same-origin absolute URLs with doc and block query params", () => {
    const href = new URL("/editor?doc=doc-a&block=seed-tryit", window.location.origin).href
    expect(parseQueryBlockLink(href)).toEqual({
      docId: "doc-a",
      blockId: "seed-tryit",
      href,
      refTarget: "doc-a#seed-tryit",
    })
  })

  it("parses relative URLs and preserves the original href", () => {
    expect(parseQueryBlockLink("/editor?doc=doc-b&block=target")).toEqual({
      docId: "doc-b",
      blockId: "target",
      href: "/editor?doc=doc-b&block=target",
      refTarget: "doc-b#target",
    })
  })

  it("returns null for external origins", () => {
    expect(parseQueryBlockLink("https://example.com/editor?doc=doc-a&block=target")).toBeNull()
  })

  it("returns null when doc or block is missing", () => {
    expect(parseQueryBlockLink("/editor?doc=doc-a")).toBeNull()
    expect(parseQueryBlockLink("/editor?block=target")).toBeNull()
    expect(parseQueryBlockLink("/editor")).toBeNull()
  })

  it("returns null for malformed URLs", () => {
    expect(parseQueryBlockLink(":// broken")).toBeNull()
  })
})
