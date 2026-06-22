// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import { SuggestionMenus, getSuggestionMenus } from "@ocai/rune-core";
import { useSuggestionMenuState } from "./useSuggestionMenuState";

function mkEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document, Paragraph, Text,
      SuggestionMenus.configure({ triggers: [{ char: "/" }] }),
    ],
  });
}

describe("useSuggestionMenuState", () => {
  it("returns null when editor is null", () => {
    const { result } = renderHook(() => useSuggestionMenuState(null, "/"));
    expect(result.current).toBeNull();
  });

  it("returns current trigger state and re-renders on store change", () => {
    const editor = mkEditor();
    const { result } = renderHook(() => useSuggestionMenuState(editor, "/"));
    expect(result.current?.show).toBe(false);

    act(() => {
      getSuggestionMenus(editor).triggers["/"]!._setState({
        show: true, query: "h", range: { from: 1, to: 2 }, getClientRect: () => null,
      });
    });
    expect(result.current?.show).toBe(true);
    expect(result.current?.query).toBe("h");
    editor.destroy();
  });
});
