// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { ChainedCommands } from "@tiptap/core";
import type { SuggestionCommitContext } from "./types";

export function commitSuggestion(
  ctx: SuggestionCommitContext,
  fn: (chain: ChainedCommands) => ChainedCommands,
): void {
  // focus(range.from) — bare focus() jumps to end-of-doc when the editor
  // isn't already focused (happens in jsdom tests; also defends against
  // the real editor temporarily losing focus between item click and
  // transaction). Focusing at range.from places the cursor where
  // deleteRange will collapse to, so any subsequent chain.insertContent
  // in fn lands at the trigger position.
  fn(ctx.editor.chain().focus(ctx.range.from).deleteRange(ctx.range)).run();
}
