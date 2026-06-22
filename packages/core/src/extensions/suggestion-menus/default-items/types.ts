// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import type { TurnIntoBlockInput } from "../../../api/types";

export type SuggestionCommitContext = {
  editor: Editor;
  /** Non-null at call time — the wrapper guarantees a live range. */
  range: { from: number; to: number };
  triggerCharacter: string;
};

export type DefaultSuggestionItem = {
  /** Stable key; used for icon lookup, translation keys, React keys. */
  key: string;
  title: string;
  onItemClick: (ctx: SuggestionCommitContext) => void;
  subtext?: string;
  badge?: string;
  aliases?: string[];
  group?: string;
  /**
   * Declarative descriptor of the block this item produces. When set,
   * the item is eligible as a Turn-into target. Items without `block`
   * (for example the emoji-picker entry) are slash-only.
   */
  block?: TurnIntoBlockInput;
};

export type DefaultGridSuggestionItem = {
  id: string;
  onItemClick: (ctx: SuggestionCommitContext) => void;
};
