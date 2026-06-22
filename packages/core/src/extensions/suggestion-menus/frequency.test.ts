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
import { SuggestionMenus } from "./SuggestionMenus";
import {
  getSuggestionFrequency,
  pickRecentlyUsed,
  recordSuggestionUse,
  suggestionFrequencyKey,
} from "./frequency";

function mkEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document,
      Paragraph,
      Text,
      SuggestionMenus.configure({ triggers: [{ char: "/" }] }),
    ],
  });
}

describe("frequency", () => {
  it("starts empty for a fresh editor", () => {
    const editor = mkEditor();
    expect(getSuggestionFrequency(editor, "/")).toEqual({});
    editor.destroy();
  });

  it("recordSuggestionUse increments count and updates lastUsedAt", () => {
    const editor = mkEditor();
    recordSuggestionUse(editor, "/", "heading_1", 1000);
    recordSuggestionUse(editor, "/", "heading_1", 2000);
    recordSuggestionUse(editor, "/", "table", 1500);
    const freq = getSuggestionFrequency(editor, "/");
    expect(freq["heading_1"]).toEqual({ count: 2, lastUsedAt: 2000 });
    expect(freq["table"]).toEqual({ count: 1, lastUsedAt: 1500 });
    editor.destroy();
  });

  it("normalizes derived item keys into their source item frequency", () => {
    const editor = mkEditor();
    recordSuggestionUse(editor, "/", "heading_1__turn-into", 1000);
    recordSuggestionUse(editor, "/", "heading_1", 2000);

    expect(suggestionFrequencyKey("heading_1__turn-into")).toBe("heading_1");
    expect(getSuggestionFrequency(editor, "/")).toEqual({
      heading_1: { count: 2, lastUsedAt: 2000 },
    });
    editor.destroy();
  });

  it("isolates frequency per trigger character", () => {
    const editor = mkEditor();
    recordSuggestionUse(editor, "/", "heading_1", 1000);
    recordSuggestionUse(editor, ":", "smile", 1000);
    expect(getSuggestionFrequency(editor, "/")).toHaveProperty("heading_1");
    expect(getSuggestionFrequency(editor, "/")).not.toHaveProperty("smile");
    expect(getSuggestionFrequency(editor, ":")).toHaveProperty("smile");
    editor.destroy();
  });

  it("pickRecentlyUsed sorts by lastUsedAt desc, ties by count desc", () => {
    const items = [
      { key: "a", title: "A" },
      { key: "b", title: "B" },
      { key: "c", title: "C" },
      { key: "d", title: "D" },
    ];
    const freq = {
      a: { count: 1, lastUsedAt: 100 },
      b: { count: 5, lastUsedAt: 300 },
      c: { count: 2, lastUsedAt: 300 }, // ties b on time, lower count
      d: { count: 9, lastUsedAt: 50 },
    };
    const top = pickRecentlyUsed(items, freq, 3);
    expect(top.map((x) => x.key)).toEqual(["b", "c", "a"]);
  });

  it("pickRecentlyUsed drops items not in the frequency map", () => {
    const items = [
      { key: "a", title: "A" },
      { key: "b", title: "B" },
    ];
    const freq = { a: { count: 1, lastUsedAt: 100 } };
    expect(pickRecentlyUsed(items, freq, 5).map((x) => x.key)).toEqual(["a"]);
  });

  it("pickRecentlyUsed returns [] for limit <= 0", () => {
    expect(pickRecentlyUsed([{ key: "a" }], { a: { count: 1, lastUsedAt: 1 } }, 0)).toEqual([]);
  });
});
