// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { SuggestionOptions } from "@tiptap/suggestion";

export const wikiLinkMatcher: NonNullable<SuggestionOptions["findSuggestionMatch"]> = ({
  $position,
}) => {
  const textBefore = $position.parent.textBetween(
    0,
    $position.parentOffset,
    undefined,
    "￼",
  );
  // `[[` + zero or more chars that are neither `[` nor `]`, anchored to cursor.
  const match = /\[\[([^[\]]*)$/.exec(textBefore);
  if (!match) return null;

  const fromOffset = $position.parentOffset - match[0].length;
  const from = $position.start() + fromOffset;
  const to = $position.pos;

  return {
    range: { from, to },
    query: match[1] ?? "",
    text: match[0],
  };
};
