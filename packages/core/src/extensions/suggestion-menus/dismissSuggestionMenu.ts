// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import { exitSuggestion } from "@tiptap/suggestion";
import { getSuggestionMenus } from "./getSuggestionMenus";

const CLOSED = {
  show: false,
  query: "",
  range: null,
  getClientRect: null,
} as const;

export function dismissSuggestionMenu(
  editor: Editor,
  triggerCharacter: string,
): boolean {
  const store = getSuggestionMenus(editor).triggers[triggerCharacter];
  if (!store) return false;

  const snap = store.getSnapshot();
  if (snap.range) {
    store.suppressedAt.current = snap.range.from;
  }
  store.forceOpenAt.current = null;

  if (store.suggestionPluginKey) {
    exitSuggestion(editor.view, store.suggestionPluginKey);
  }

  // Keep the store-close path deterministic for tests and for callers that
  // opened the store directly instead of through @tiptap/suggestion.
  store._setState(CLOSED);
  return true;
}
