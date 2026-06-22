// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { NativeMenuContent } from "./NativeMenu"

describe("NativeMenuContent", () => {
  it("marks floating menu chrome so editor hover listeners can ignore it", () => {
    render(
      <NativeMenuContent>
        <button type="button">Item</button>
      </NativeMenuContent>,
    )

    expect(screen.getByRole("button").closest("[data-rune-editor-chrome]")).not.toBeNull()
  })
})
