// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import { SuggestionMenus, getSuggestionMenus, commitSuggestion } from "@ocai/rune-core";
import { ComponentsContext, defaultComponents } from "../ComponentsContext";
import { RuneMentionMenu } from "./RuneMentionMenu";

describe("RuneMentionMenu", () => {
  it("renders items from getItems when @ trigger is active", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        Document, Paragraph, Text,
        SuggestionMenus.configure({ triggers: [{ char: "@" }] }),
      ],
    });
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneMentionMenu
          editor={editor}
          getItems={async () => [
            {
              key: "alice",
              title: "alice",
              onItemClick: (ctx) =>
                commitSuggestion(ctx, (c) => c.insertContent("@alice")),
            },
          ]}
        />
      </ComponentsContext.Provider>,
    );
    act(() => {
      getSuggestionMenus(editor).triggers["@"]!._setState({
        show: true, query: "a", range: { from: 1, to: 2 },
        getClientRect: () => new DOMRect(0, 0, 0, 16),
      });
    });
    expect(await screen.findByText("alice")).toBeInTheDocument();
    editor.destroy();
  });
});
