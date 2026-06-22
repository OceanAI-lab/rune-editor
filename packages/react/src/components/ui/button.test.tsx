// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Button } from "./button"

describe("Button", () => {
  it("uses --editor-accent for the default background", () => {
    render(<Button>Save</Button>)

    const classes = screen
      .getByRole("button", { name: "Save" })
      .className.split(" ")

    expect(classes).toContain("bg-[var(--editor-accent)]")
    expect(classes).not.toContain("bg-primary")
    expect(classes).not.toContain("bg-editor-accent")
  })

  it("does not shift vertically on active press", () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole("button", { name: "Save" }).className).not.toContain(
      "translate-y",
    )
  })

  it.each(["ghost", "outline"] as const)(
    "uses accent colors for %s hover and expanded states",
    (variant) => {
      render(<Button variant={variant}>{variant}</Button>)

      const classes = screen
        .getByRole("button", { name: variant })
        .className.split(" ")

      expect(classes).toContain("hover:bg-accent")
      expect(classes).toContain("hover:text-accent-foreground")
      expect(classes).toContain("aria-expanded:bg-accent")
      expect(classes).toContain("aria-expanded:text-accent-foreground")
      expect(classes).not.toContain("hover:bg-muted")
      expect(classes).not.toContain("aria-expanded:bg-muted")
    },
  )
})
