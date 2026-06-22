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
import { wikiLinkMatcher } from "./wikiLinkMatcher";

function resolve(text: string) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text],
    content: `<p>${text}</p>`,
  });
  // End of document = cursor at end of text.
  const $position = editor.state.doc.resolve(editor.state.doc.content.size - 1);
  try {
    return wikiLinkMatcher!({
      $position,
      char: "[[",
      allowSpaces: true,
      allowedPrefixes: null,
      allowToIncludeChar: false,
      startOfLine: false,
    });
  } finally {
    editor.destroy();
  }
}

describe("wikiLinkMatcher", () => {
  it("matches an open [[ with no closing", () => {
    const m = resolve("hello [[foo");
    expect(m).not.toBeNull();
    expect(m!.query).toBe("foo");
    expect(m!.text).toBe("[[foo");
  });

  it("matches an empty open [[", () => {
    const m = resolve("[[");
    expect(m).not.toBeNull();
    expect(m!.query).toBe("");
  });

  it("does not match a closed [[foo]]", () => {
    expect(resolve("[[foo]]")).toBeNull();
  });

  it("does not match a single [", () => {
    expect(resolve("[foo")).toBeNull();
  });

  it("does not match when another [ appears inside", () => {
    expect(resolve("[[foo[bar")).toBeNull();
  });
});
