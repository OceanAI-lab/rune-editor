// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// CSS string escape — `url('...')` arguments and `content: '...'` follow the
// same rules: `\` doubles, `'` is `\'`. Used for both `--rune-wikilink-icon-
// image` (URL) and `--rune-wikilink-icon-text` (glyph) so downstream-supplied
// strings can't break out of the CSS string literal.
export function escapeCssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")
}
