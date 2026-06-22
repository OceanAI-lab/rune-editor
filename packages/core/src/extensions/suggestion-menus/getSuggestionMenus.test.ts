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
import { getSuggestionMenus } from "./getSuggestionMenus";

describe("getSuggestionMenus", () => {
  it("returns typed storage with configured triggers", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        Document,
        Paragraph,
        Text,
        SuggestionMenus.configure({ triggers: [{ char: "/" }] }),
      ],
    });
    const storage = getSuggestionMenus(editor);
    expect(storage.triggers["/"]!.getSnapshot().show).toBe(false);
    editor.destroy();
  });

  it("throws when the extension is not registered", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Text],
    });
    expect(() => getSuggestionMenus(editor)).toThrow(/SuggestionMenus/);
    editor.destroy();
  });
});
