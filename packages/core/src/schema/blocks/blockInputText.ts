// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

const isString = (v: unknown): v is string => typeof v === "string"

/**
 * The inline text for a text block, read from its `fromInput` input. `text` is
 * the canonical field — every text block's schema-context example and the
 * `insert_blocks` / `turn_into` / `update_block` tool descriptors advertise it.
 * `content` is tolerated as an alias because agents frequently guess it; the
 * first string-valued field wins, and an absent/non-string value yields "".
 *
 * Centralised so the text blocks (Paragraph, Heading, Blockquote, Bullet/
 * Numbered/Task list, Toggle, CodeBlock) share one read + fallback rule instead
 * of each inlining the precedence.
 */
export function readBlockInputText(input: Record<string, unknown>): string {
  return [input.text, input.content].find(isString) ?? ""
}
