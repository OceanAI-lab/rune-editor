// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("text selection styling", () => {
  it("derives the native text selection background from --editor-accent via a tunable α", () => {
    // The per-mode α is retuned independently for light/dark (see the
    // comment block above the token in rune-tokens.css), so this test
    // intentionally avoids pinning the percentage — it asserts the
    // wiring (text-selection-bg = color-mix of --editor-accent with
    // transparent, and typography reads it via ::selection /
    // ::-moz-selection). A specific α value belongs in a visual
    // snapshot test, not here.
    const tokens = readFileSync(
      join(process.cwd(), "src/styles/rune-tokens.css"),
      "utf8",
    )
    const typography = readFileSync(
      join(process.cwd(), "src/styles/typography.css"),
      "utf8",
    )

    expect(tokens).toMatch(
      /--rune-text-selection-bg:\s*color-mix\(in oklab,\s*var\(--editor-accent\)\s*[\d.]+%,\s*transparent\);/,
    )
    expect(typography).toContain("background: var(--rune-text-selection-bg);")
    expect(typography).toContain("::-moz-selection")
  })
})
