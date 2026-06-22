// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// packages/core/src/extensions/suggestion-menus/SuggestionMenus.test.ts
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import { SuggestionMenus } from "./SuggestionMenus";
import { getSuggestionMenus } from "./getSuggestionMenus";

function mkEditor(triggers: { char: string }[]) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document, Paragraph, Text,
      SuggestionMenus.configure({ triggers }),
    ],
  });
}

function mockClipboardData(text: string): DataTransfer {
  const store = new Map<string, string>([["text/plain", text]]);
  return {
    get types() {
      return Array.from(store.keys());
    },
    getData: (mime: string) => store.get(mime) ?? "",
    setData: (mime: string, value: string) => {
      store.set(mime, value);
    },
    clearData: () => {
      store.clear();
    },
  } as unknown as DataTransfer;
}

function pastePlain(editor: Editor, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: mockClipboardData(text),
  });
  editor.view.dom.focus();
  editor.view.dom.dispatchEvent(event);
}

describe("SuggestionMenus extension", () => {
  it("registers one trigger store per configured trigger", () => {
    const editor = mkEditor([{ char: "/" }, { char: ":" }]);
    const storage = getSuggestionMenus(editor);
    expect(Object.keys(storage.triggers).sort()).toEqual(["/", ":"]);
    expect(storage.triggers["/"]!.getSnapshot().show).toBe(false);
    editor.destroy();
  });

  it("registers zero triggers when configured with empty array", () => {
    const editor = mkEditor([]);
    expect(getSuggestionMenus(editor).triggers).toEqual({});
    editor.destroy();
  });

  it("adds N PM plugins — one per trigger", () => {
    const editor = mkEditor([{ char: "/" }, { char: ":" }, { char: "@" }]);
    // @tiptap/suggestion plugins register as plain PM plugins; count via a marker
    // (we assert count of stores which is 1:1 with plugins).
    expect(Object.keys(getSuggestionMenus(editor).triggers)).toHaveLength(3);
    editor.destroy();
  });

  it("throws on duplicate trigger char", () => {
    expect(() => mkEditor([{ char: "/" }, { char: "/" }])).toThrow(
      /duplicate trigger char/i,
    );
  });

  it("does not open slash menu for pasted text that starts with slash", async () => {
    const editor = mkEditor([{ char: "/" }]);
    editor.commands.setTextSelection(1);

    pastePlain(editor, "/?doc=doc-a&block=seed-entityrefs");
    await Promise.resolve();
    editor.view.dispatch(editor.state.tr);
    await Promise.resolve();

    const storage = getSuggestionMenus(editor);
    expect(editor.state.doc.textContent).toBe("/?doc=doc-a&block=seed-entityrefs");
    expect(storage.triggers["/"]!.getSnapshot().show).toBe(false);
    editor.destroy();
  });

  // The paste branch in `shouldShow` arms suppression with
  // `suppressedAtIsCurrentDocPos = true`, which makes `suppressionGuard`
  // skip mapping for exactly the next transaction (the position already
  // points into the post-paste doc) and then resume mapping. This exercises
  // that skip-once-then-map path: after the flag is consumed, a position-
  // shifting edit must still map `suppressedAt`, and deleting the trigger
  // char at the (now-shifted) position must clear it so the menu can reopen.
  it("maps and clears paste-armed suppression across follow-up edits", async () => {
    const editor = mkEditor([{ char: "/" }]);
    editor.commands.setTextSelection(1);

    // Arm paste-suppression: shouldShow sets suppressedAt = "/" position and
    // suppressedAtIsCurrentDocPos = true; the menu must not open.
    pastePlain(editor, "/foo");
    await Promise.resolve();
    editor.view.dispatch(editor.state.tr);
    await Promise.resolve();

    const store = getSuggestionMenus(editor).triggers["/"]!;
    expect(editor.state.doc.textContent).toBe("/foo");
    expect(store.getSnapshot().show).toBe(false);
    expect(store.suppressedAt.current).toBe(1);

    // Position-shifting edit BEFORE the trigger char. With the skip-once flag
    // already consumed, the guard must map suppressedAt 1 → 2. (If mapping
    // were skipped permanently, the stale position would no longer track the
    // trigger char.)
    editor.commands.insertContentAt(1, "X");
    await Promise.resolve();
    expect(editor.state.doc.textContent).toBe("X/foo");
    expect(store.getSnapshot().show).toBe(false);
    expect(store.suppressedAt.current).toBe(2);

    // Remove the trigger char at the mapped position; suppression must clear
    // so a fresh `/` could reopen the menu.
    editor.commands.deleteRange({ from: 2, to: 3 });
    await Promise.resolve();
    expect(editor.state.doc.textContent).toBe("Xfoo");
    expect(store.suppressedAt.current).toBeNull();

    editor.destroy();
  });
});
