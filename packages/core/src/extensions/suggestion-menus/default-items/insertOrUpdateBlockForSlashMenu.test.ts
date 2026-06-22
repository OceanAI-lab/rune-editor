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
import Heading from "@tiptap/extension-heading";
import { Divider } from "../../../blocks/Divider/block";
import { createTestEditor } from "../../../test-utils/createTestEditor";
import { insertOrUpdateBlockForSlashMenu } from "./insertOrUpdateBlockForSlashMenu";
import type { SuggestionCommitContext } from "./types";

function mkEditor(html: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Heading, Divider, Text],
    content: html,
  });
}

function ctxAt(editor: Editor, from: number, to: number, char = "/"): SuggestionCommitContext {
  return { editor, range: { from, to }, triggerCharacter: char };
}

describe("insertOrUpdateBlockForSlashMenu", () => {
  it("replaces an empty paragraph whose only content is the trigger text", () => {
    const editor = mkEditor("<p>/heading</p>");
    // "/heading" occupies positions 1..9
    insertOrUpdateBlockForSlashMenu(
      ctxAt(editor, 1, 9),
      { type: "heading", props: { level: 2 } },
    );
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild!.type.name).toBe("heading");
    editor.destroy();
  });

  it("inserts a new block after the current one when current is not empty", () => {
    const editor = mkEditor("<p>hello /heading</p>");
    // Trigger at positions 7..15 ("/heading" inside "hello /heading")
    insertOrUpdateBlockForSlashMenu(
      ctxAt(editor, 7, 15),
      { type: "heading", props: { level: 2 } },
    );
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.firstChild!.textContent).toBe("hello ");
    expect(editor.state.doc.lastChild!.type.name).toBe("heading");
    // Caret lands inside the newly-inserted heading — not the source block.
    // Without this, typing right after the slash menu commit would extend
    // the source block (felt as "the slash did nothing").
    const $from = editor.state.doc.resolve(editor.state.selection.from);
    expect($from.parent.type.name).toBe("heading");
    editor.destroy();
  });

  it("replaces an empty paragraph with an atom block and lands in a trailing paragraph", () => {
    const editor = mkEditor("<p>/divider</p>");
    insertOrUpdateBlockForSlashMenu(ctxAt(editor, 1, 9), { type: "divider" });

    expect(editor.state.doc.children.map((node) => node.type.name)).toEqual([
      "divider",
      "paragraph",
    ]);
    const $from = editor.state.doc.resolve(editor.state.selection.from);
    expect($from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.empty).toBe(true);
    editor.destroy();
  });

  it("inserts an atom block after non-empty content and lands in a trailing paragraph", () => {
    const editor = mkEditor("<p>hello /divider</p>");
    insertOrUpdateBlockForSlashMenu(ctxAt(editor, 7, 15), { type: "divider" });

    expect(editor.state.doc.children.map((node) => node.type.name)).toEqual([
      "paragraph",
      "divider",
      "paragraph",
    ]);
    expect(editor.state.doc.firstChild!.textContent).toBe("hello ");
    const $from = editor.state.doc.resolve(editor.state.selection.from);
    expect($from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.empty).toBe(true);
    editor.destroy();
  });

  it("preserves source-block depth when converting an empty trigger-only block to paragraph", () => {
    // Regression lock. User is inside a depth-1 numberedList item (its only
    // content is the "/text" trigger). Slash-converting to paragraph must keep
    // the new block at depth=1 so it stays visually nested in the surrounding
    // list. Tiptap's `setNode` happens to merge attrs (not replace) so this
    // already works — probed before adding a "fix" that turned out to be a
    // no-op (memory: feedback_no_theoretical_fixes). This test guards against
    // a future Tiptap behavior change that would break the nesting.
    // Uses createTestEditor (full rune kit) because `numberedList` lives there.
    const editor = createTestEditor({
      content: {
        type: "doc",
        content: [
          { type: "numberedList", attrs: { depth: 0 }, content: [{ type: "text", text: "one" }] },
          { type: "numberedList", attrs: { depth: 1 }, content: [{ type: "text", text: "/text" }] },
        ],
      },
    });
    // The trigger "/text" lives inside the second block; range covers it.
    // setSelection there first — `setNode` in the chain operates on the
    // current selection's parent, mirroring how the suggestion-menu plugin
    // places the caret inside the trigger before calling commit.
    const secondStart = editor.state.doc.firstChild!.nodeSize + 1;
    editor.commands.setTextSelection(secondStart);
    insertOrUpdateBlockForSlashMenu(
      ctxAt(editor, secondStart, secondStart + 5),
      { type: "paragraph" },
    );
    const converted = editor.state.doc.child(1);
    expect(converted.type.name).toBe("paragraph");
    expect(converted.attrs.depth).toBe(1);
    expect(converted.textContent).toBe("");
  });
});
