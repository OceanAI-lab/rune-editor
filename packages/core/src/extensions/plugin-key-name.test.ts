// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/// <reference types="vite/client" />

import { describe, expect, it } from "vitest"
import { pluginKeyPart, runePluginKeyName } from "./plugin-key-name"

const sourceFiles = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

describe("plugin key names", () => {
  it("normalizes dynamic PluginKey parts to stable kebab names", () => {
    expect(pluginKeyPart("/")).toBe("slash")
    expect(pluginKeyPart(":")).toBe("colon")
    expect(pluginKeyPart("[[")).toBe("double-left-bracket")
    expect(pluginKeyPart("wikiLink")).toBe("wiki-link")
    expect(runePluginKeyName("entity-ref-decoration", "wikiLink")).toBe(
      "rune-entity-ref-decoration-wiki-link",
    )
  })

  it("keeps every PluginKey under the rune-kebab-case namespace", () => {
    const offenders: string[] = []
    for (const [file, source] of Object.entries(sourceFiles)) {
      if (file.endsWith("plugin-key-name.test.ts")) continue
      const lines = source.split("\n")
      lines.forEach((line, index) => {
        if (!line.includes("new PluginKey")) return
        const snippet = lines.slice(index, index + 4).join("\n")
        const hasRuneLiteral = /new PluginKey(?:<[^>]+>)?\(\s*["'`]rune-/s.test(snippet)
        const hasRuneHelper = /new PluginKey(?:<[^>]+>)?\(\s*runePluginKeyName\(/s.test(snippet)
        if (!hasRuneLiteral && !hasRuneHelper) {
          offenders.push(`${file}:${index + 1}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
