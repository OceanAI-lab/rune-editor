// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { SuggestionCommitContext } from "../suggestion-menus"

export function commitWikiLink(
  ctx: SuggestionCommitContext,
  attrs: { target: string; alias?: string },
): void {
  if (!attrs.target) return

  const { editor, range } = ctx
  const hasAlias = !!(attrs.alias && attrs.alias.length > 0)
  const text = hasAlias ? attrs.alias! : attrs.target
  const markType = editor.schema.marks.internalRef ?? editor.schema.marks.wikiLink
  if (!markType) return
  const markAttrs =
    markType.name === "internalRef"
      ? { kind: "page", target: attrs.target, ...(hasAlias ? { alias: true } : {}) }
      : { target: attrs.target }

  editor
    .chain()
    .focus(range.from)
    .deleteRange(range)
    .insertContent({
      type: "text",
      text,
      marks: [{ type: markType.name, attrs: markAttrs }],
    })
    .run()
}
