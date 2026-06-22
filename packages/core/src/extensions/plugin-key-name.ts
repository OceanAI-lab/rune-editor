// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

const EXACT_PARTS = new Map<string, string>([
  ["/", "slash"],
  [":", "colon"],
  ["@", "at"],
  ["[[", "double-left-bracket"],
])

const CHAR_PARTS = new Map<string, string>([
  ["/", "slash"],
  [":", "colon"],
  ["@", "at"],
  ["[", "left-bracket"],
  ["]", "right-bracket"],
  ["#", "hash"],
  ["!", "bang"],
  ["?", "question"],
  [".", "dot"],
  [",", "comma"],
  ["*", "asterisk"],
  ["+", "plus"],
  ["=", "equals"],
  ["~", "tilde"],
  ["|", "pipe"],
  ["\\", "backslash"],
  ["<", "less-than"],
  [">", "greater-than"],
  ["&", "and"],
])

export function pluginKeyPart(value: string): string {
  const exact = EXACT_PARTS.get(value)
  if (exact) return exact

  const namedChars = Array.from(value.trim())
    .map((char) => {
      const named = CHAR_PARTS.get(char)
      return named ? `-${named}-` : char
    })
    .join("")

  const normalized = namedChars
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || "value"
}

export function runePluginKeyName(...parts: string[]): string {
  return `rune-${parts.map(pluginKeyPart).join("-")}`
}
