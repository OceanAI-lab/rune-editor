// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import { SuggestionMenus, getSuggestionMenus } from "@ocai/rune-core";
import { RuneEmojiPicker } from "./RuneEmojiPicker";

describe("RuneEmojiPicker", () => {
  it("opens the picker when the `:` trigger fires", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        Document, Paragraph, Text,
        SuggestionMenus.configure({ triggers: [{ char: ":" }] }),
      ],
    });
    render(<RuneEmojiPicker editor={editor} />);
    act(() => {
      getSuggestionMenus(editor).triggers[":"]!._setState({
        show: true, query: "", range: { from: 1, to: 2 },
        getClientRect: () => new DOMRect(0, 0, 0, 16),
      });
    });
    // Frimousse fetches emoji data over the network at runtime, which jsdom
    // cannot serve. We only assert the picker shell mounts (frimousse Root
    // emits a `frimousse-root` attribute) — the corpus / grid / filtering
    // are exercised in Playwright e2e.
    const roots = document.querySelectorAll("[frimousse-root]");
    expect(roots.length).toBe(1);
    editor.destroy();
  });
});
