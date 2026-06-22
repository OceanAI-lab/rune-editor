// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("wiki-link styling", () => {
  it("keeps a small inline-end pad so following text does not visually merge into the link", () => {
    const tokens = readFileSync(
      join(process.cwd(), "src/styles/rune-tokens.css"),
      "utf8",
    )
    const wikilink = readFileSync(
      join(process.cwd(), "src/styles/wikilink.css"),
      "utf8",
    )

    expect(tokens).toContain("--rune-wikilink-end-padding: 2px;")
    expect(wikilink).toContain(
      "padding-inline-end: var(--rune-wikilink-end-padding);",
    )
  })
})
