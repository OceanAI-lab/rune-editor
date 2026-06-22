// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import History from "@tiptap/extension-history";
import { commitSuggestion } from "./commitSuggestion";
import type { SuggestionCommitContext } from "./types";

function mkCtx(content: string, triggerText: string): {
  ctx: SuggestionCommitContext;
  editor: Editor;
} {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, History],
    content: `<p>${content}</p>`,
  });
  const idx = content.indexOf(triggerText);
  const from = idx + 1; // +1 for the <p> open
  const to = from + triggerText.length;
  return {
    ctx: { editor, range: { from, to }, triggerCharacter: triggerText[0]! },
    editor,
  };
}

describe("commitSuggestion", () => {
  it("deletes the trigger range and runs fn in one transaction", () => {
    const { ctx, editor } = mkCtx("hello /slash world", "/slash");
    commitSuggestion(ctx, (chain) => chain.insertContent("WORLD"));
    expect(editor.getText()).toBe("hello WORLD world");
    editor.destroy();
  });

  it("coalesces into one undo step", () => {
    const { ctx, editor } = mkCtx("hello /foo", "/foo");
    commitSuggestion(ctx, (chain) => chain.insertContent("X"));
    expect(editor.getText()).toBe("hello X");
    editor.commands.undo();
    expect(editor.getText()).toBe("hello /foo");
    editor.destroy();
  });
});
