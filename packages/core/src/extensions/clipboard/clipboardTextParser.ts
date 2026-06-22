// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Slice, Fragment } from "@tiptap/pm/model"
import type { ResolvedPos } from "@tiptap/pm/model"

/**
 * Tiptap/PM `clipboardTextParser` prop. Splits incoming plain text on
 * single `\n` (after CRLF normalization) producing one paragraph per
 * line. Leading/trailing blank lines are stripped; middle blank lines
 * become empty paragraphs (the user's explicit empty lines).
 *
 * Asymmetric to the default text serializer (which uses `\n\n` between
 * blocks). Documented trade-off in the M2 spec §5.4: parser matches
 * issue DoD ("one paragraph per line"); serializer matches plain-text
 * editor conventions (TextEdit/email/README expect `\n\n` between paras).
 */
export function clipboardTextParser(text: string, $context: ResolvedPos): Slice {
  const normalized = text.replace(/\r\n?/g, "\n")
  if (normalized === "") return Slice.empty

  const lines = normalized.split("\n")
  while (lines.length > 0 && lines[0] === "") lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  if (lines.length === 0) return Slice.empty

  const schema = $context.doc.type.schema
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) return Slice.empty
  const nodes = lines.map((line) =>
    line === ""
      ? paragraphType.create()
      : paragraphType.create(null, schema.text(line)),
  )
  // openStart/openEnd = 1: lets the first/last paragraph in the pasted slice
  // merge with the surrounding paragraph at the cursor, e.g. paste "a\nb"
  // into <p>X|Y</p> → <p>Xa</p><p>bY</p>. Matches PM's default text-paste
  // behavior; closed slices (0, 0) would split the host paragraph instead.
  return new Slice(Fragment.from(nodes), 1, 1)
}
