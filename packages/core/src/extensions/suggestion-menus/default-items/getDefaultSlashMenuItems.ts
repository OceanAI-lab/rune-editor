// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import type { DefaultSuggestionItem } from "./types";
import { GLOBAL_ITEM_FACTORIES } from "./globalItems";
import { forEachBlockSpec } from "../../../schema";

export function getDefaultSlashMenuItems(editor: Editor): DefaultSuggestionItem[] {
  const out: DefaultSuggestionItem[] = [];

  forEachBlockSpec(editor, (_name, meta) => {
    if (meta.slashMenuItems) out.push(...meta.slashMenuItems(editor));
  });

  for (const factory of GLOBAL_ITEM_FACTORIES) {
    const item = factory(editor);
    if (item) out.push(item);
  }

  return out;
}
