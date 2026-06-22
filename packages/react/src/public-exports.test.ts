// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("public react exports", () => {
  it("keeps the root barrel explicit", () => {
    const source = readFileSync(join(process.cwd(), "src/index.ts"), "utf8")

    expect(source).not.toMatch(/^export \* from /m)
  })
})
