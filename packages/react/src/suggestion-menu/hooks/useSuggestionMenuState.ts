// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import { getSuggestionMenus, type TriggerState } from "@ocai/rune-core";

const NO_OP_SUBSCRIBE = () => () => {};
const NO_OP_SNAPSHOT = (): TriggerState | null => null;

export function useSuggestionMenuState(
  editor: Editor | null,
  triggerCharacter: string,
): TriggerState | null {
  const store = editor
    ? getSuggestionMenus(editor).triggers[triggerCharacter] ?? null
    : null;

  return useSyncExternalStore(
    store?.subscribe ?? NO_OP_SUBSCRIBE,
    store?.getSnapshot ?? NO_OP_SNAPSHOT,
    NO_OP_SNAPSHOT,
  );
}
