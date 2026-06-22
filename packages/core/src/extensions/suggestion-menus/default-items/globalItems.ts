// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { Editor } from "@tiptap/core";
import type { DefaultSuggestionItem } from "./types";

// Global slash-menu items — items that aren't owned by a specific block.
// Each block now owns its own slash items via createBlockSpec's
// `slashMenuItems` field. This file stays for items that genuinely don't
// belong to one block (e.g. cross-block templates, inline-emoji insert,
// inline math entry).

const emojiItem = (editor: Editor): DefaultSuggestionItem => ({
  key: "emoji",
  title: "Emoji",
  aliases: ["emoji", "smiley", "icon"],
  onItemClick: ({ range }) => {
    // Hand off to the `:` trigger: replace the user's `/query` with
    // `:` at the same position and force-open the emoji picker there.
    // From that point on the picker is driven by the regular `:`
    // trigger flow — typing more characters filters live; deleting
    // the `:` closes the picker.
    editor.commands.spawnEmojiTrigger({ range });
  },
});

// "Inline equation" — single slot for KaTeX entry, regardless of which
// affordance opened it (slash menu, inline toolbar Math button, or the
// Cmd+Shift+E shortcut). All three insert the same `inlineMath` PM
// node; the popover + NodeView are shared. No `block` field — this is
// inline-only and not a Turn-into target.
const inlineEquationItem = (editor: Editor): DefaultSuggestionItem | null => {
  if (!editor.schema.nodes.inlineMath) return null;
  return {
    key: "inlineEquation",
    title: "Inline equation",
    aliases: ["math", "latex", "katex", "tex", "formula", "equation"],
    group: "Basic blocks",
    onItemClick: ({ range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertInlineMath({ latex: "" })
        .run();
    },
  };
};

export const GLOBAL_ITEM_FACTORIES: Array<
  (editor: Editor) => DefaultSuggestionItem | null
> = [inlineEquationItem, emojiItem];
