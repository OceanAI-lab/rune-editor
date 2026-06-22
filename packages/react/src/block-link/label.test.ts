// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { formatBlockMentionLabel } from "./label"

describe("formatBlockMentionLabel", () => {
  it("joins normalized doc title and block preview with an ASCII hyphen", () => {
    expect(
      formatBlockMentionLabel({
        docTitle: "  Project   notes ",
        blockPreview: " Launch\n checklist ",
      }),
    ).toBe("Project notes - Launch checklist")
  })

  it("uses stable fallbacks for empty title and preview", () => {
    expect(formatBlockMentionLabel({ docTitle: " ", blockPreview: "" })).toBe(
      "Untitled - Empty block",
    )
  })

  it("caps very long labels with three dots", () => {
    const label = formatBlockMentionLabel({
      docTitle: "Doc",
      blockPreview: "x".repeat(200),
    })
    expect(label.length).toBeLessThanOrEqual(120)
    expect(label.endsWith("...")).toBe(true)
  })
})
