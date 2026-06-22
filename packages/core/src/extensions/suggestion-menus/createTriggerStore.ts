// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/core/src/extensions/suggestion-menus/createTriggerStore.ts
import type { TriggerState, TriggerStore } from "./types";
import type { PluginKey } from "@tiptap/pm/state";

const CLOSED: TriggerState = {
  show: false,
  query: "",
  range: null,
  getClientRect: null,
};

export function createTriggerStore(
  suggestionPluginKey: PluginKey | null = null,
): TriggerStore {
  let state: TriggerState = CLOSED;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    _setState(next) {
      state = next;
      for (const l of listeners) l();
    },
    suggestionPluginKey,
    keyHandler: { current: null },
    forceOpenAt: { current: null },
    suppressedAt: { current: null },
    suppressedAtIsCurrentDocPos: { current: false },
    sessionRun: { current: null },
  };
}
