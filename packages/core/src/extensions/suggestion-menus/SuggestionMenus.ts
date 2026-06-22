// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/core/src/extensions/suggestion-menus/SuggestionMenus.ts
import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { createTriggerPlugin } from "./createTriggerPlugin";
import { getSuggestionMenus } from "./getSuggestionMenus";
import type { SuggestionMenusOptions, SuggestionMenusStorage } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    suggestionMenus: {
      /** Open the slash menu by inserting "/" at the given PM position. */
      openSlashMenu: (args: { pos: number }) => ReturnType;
      /**
       * Replace the given range with `:` and force-open the `:` trigger
       * at the inserted position. Used by the slash-menu Emoji item so
       * that selecting `/ → Emoji` swaps the typed `/query` for a `:`
       * trigger session — the user can keep typing to filter the emoji
       * picker, and deleting the `:` closes the picker just like the
       * organic typed-`:` flow.
       */
      spawnEmojiTrigger: (args: { range: { from: number; to: number } }) => ReturnType;
    };
  }
}

export const SuggestionMenus = Extension.create<
  SuggestionMenusOptions,
  SuggestionMenusStorage
>({
  name: "suggestionMenus",
  // Outrank Indent (priority 1000) and any block-level Enter keymap so that
  // when the suggestion menu is open, Enter / Tab / Arrow keys are claimed
  // by the menu first. Without this, typing `/heading` from inside a
  // non-empty list lets Indent's Enter handler fire `splitListBlock` before
  // @tiptap/suggestion's `handleKeyDown` gets a chance to commit — the user
  // sees "Enter inserted a new list item" instead of "Enter committed the
  // heading". The suggestion plugin's keydown is gated on `active`, so
  // outside an open menu it's a passthrough — outranking is safe.
  priority: 1500,

  addOptions() {
    return { triggers: [] };
  },

  addStorage() {
    return {
      triggers: {},
      frequency: {},
    };
  },

  addProseMirrorPlugins() {
    return this.options.triggers.flatMap((cfg) =>
      createTriggerPlugin(this.editor, this.storage, cfg),
    );
  },

  addCommands() {
    return {
      openSlashMenu:
        ({ pos }: { pos: number }) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return false;
          tr.setSelection(TextSelection.create(state.doc, pos));
          tr.insertText("/");
          dispatch(tr);
          return true;
        },
      spawnEmojiTrigger:
        ({ range }: { range: { from: number; to: number } }) =>
        ({ editor, chain }) => {
          const colon = getSuggestionMenus(editor).triggers[":"];
          if (!colon) return false;
          // Mark the inserted `:` position as force-open so the `:`
          // trigger's wrapped shouldShow opens the picker immediately
          // (the regular gate requires `query.length > 0`). The flag
          // clears itself when the resulting suggestion session ends.
          colon.forceOpenAt.current = range.from;
          return chain().focus().insertContentAt(range, ":").run();
        },
    };
  },
});
