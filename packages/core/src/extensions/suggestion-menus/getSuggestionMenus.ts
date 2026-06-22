// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import type { SuggestionMenusStorage } from "./types";

export function getSuggestionMenus(editor: Editor): SuggestionMenusStorage {
  const storage = (editor.storage as unknown as Record<string, unknown>)[
    "suggestionMenus"
  ] as SuggestionMenusStorage | undefined;
  if (!storage) {
    throw new Error(
      "SuggestionMenus extension is not registered on this editor. " +
        "Add SuggestionMenus.configure({ triggers: [...] }) to your extensions array.",
    );
  }
  return storage;
}
