// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import { SuggestionMenuController } from "../SuggestionMenuController";
import type { DefaultReactSuggestionItem } from "../types";

export function RuneLinkMenu({
  editor,
  getItems,
}: {
  editor: Editor | null;
  getItems?: (query: string) => Promise<DefaultReactSuggestionItem[]>;
}) {
  return (
    <SuggestionMenuController
      editor={editor}
      triggerCharacter="[["
      getItems={getItems ?? (async () => [])}
    />
  );
}
