// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/react/src/suggestion-menu/hooks/useSuggestionMenuKeyboard.ts
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { getSuggestionMenus } from "@ocai/rune-core";

export interface KeyboardBinding<T> {
  items: T[];
  selectedIndex: number;
  setSelectedIndex: (idx: number) => void;
  commit: (item: T) => void;
  close: () => void;
}

// Shared with non-PM-plugin callers (e.g. the inline-toolbar Turn-into menu
// that opens from a button, not from a typed trigger character). Returns
// true when the event is consumed and should be prevented from reaching
// downstream handlers (PM, document listeners, etc).
//
// Pass through modified chords (Cmd/Ctrl/Alt + key) so host keybindings
// like Cmd+Enter, Cmd+ArrowDown reach PM. Plain Shift is NOT a modifier
// here — Shift+Enter / Shift+Tab should still commit.
export function handleSuggestionNavKey<T>(
  event: KeyboardEvent,
  binding: KeyboardBinding<T>,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.isComposing) return false;
  const { items, selectedIndex, setSelectedIndex, commit, close } = binding;
  const count = items.length;
  switch (event.key) {
    case "ArrowDown":
      if (count === 0) return true;
      setSelectedIndex((selectedIndex + 1) % count);
      return true;
    case "ArrowUp":
      if (count === 0) return true;
      setSelectedIndex((selectedIndex - 1 + count) % count);
      return true;
    case "PageUp":
    case "Home":
      if (count === 0) return true;
      setSelectedIndex(0);
      return true;
    case "PageDown":
    case "End":
      if (count === 0) return true;
      setSelectedIndex(count - 1);
      return true;
    case "Enter":
    case "Tab": {
      const item = items[selectedIndex];
      if (item !== undefined) commit(item);
      return true;
    }
    case "Escape":
      close();
      return true;
    default:
      return false;
  }
}

export function useSuggestionMenuKeyboard<T>(
  editor: Editor | null,
  triggerCharacter: string,
  binding: KeyboardBinding<T>,
): void {
  // Refs let the handler read live values without re-registering.
  const ref = useRef(binding);
  ref.current = binding;

  useEffect(() => {
    if (!editor) return;
    const slot = getSuggestionMenus(editor).triggers[triggerCharacter];
    if (!slot) return;

    slot.keyHandler.current = (event) =>
      handleSuggestionNavKey(event, ref.current);

    return () => {
      slot.keyHandler.current = null;
    };
  }, [editor, triggerCharacter]);
}
