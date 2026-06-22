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
import { SuggestionMenus, wikiLinkMatcher, getSuggestionMenus, commitSuggestion } from "@ocai/rune-core";
import { ComponentsContext, defaultComponents } from "../ComponentsContext";
import { RuneLinkMenu } from "./RuneLinkMenu";

describe("RuneLinkMenu", () => {
  it("renders items from getItems when [[ trigger is active", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        Document, Paragraph, Text,
        SuggestionMenus.configure({ triggers: [{ char: "[[", matcher: wikiLinkMatcher }] }),
      ],
    });
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneLinkMenu
          editor={editor}
          getItems={async () => [
            {
              key: "home",
              title: "Home",
              onItemClick: (ctx) => commitSuggestion(ctx, (c) => c.insertContent("[[Home]]")),
            },
          ]}
        />
      </ComponentsContext.Provider>,
    );
    act(() => {
      getSuggestionMenus(editor).triggers["[["]!._setState({
        show: true, query: "h", range: { from: 1, to: 4 },
        getClientRect: () => new DOMRect(0, 0, 0, 16),
      });
    });
    expect(await screen.findByText("Home")).toBeInTheDocument();
    editor.destroy();
  });

  it("shows 'No results' when default (empty) getItems is used", async () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        Document, Paragraph, Text,
        SuggestionMenus.configure({ triggers: [{ char: "[[", matcher: wikiLinkMatcher }] }),
      ],
    });
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneLinkMenu editor={editor} />
      </ComponentsContext.Provider>,
    );
    act(() => {
      getSuggestionMenus(editor).triggers["[["]!._setState({
        show: true, query: "x", range: { from: 1, to: 4 },
        getClientRect: () => new DOMRect(0, 0, 0, 16),
      });
    });
    expect(await screen.findByText("No results")).toBeInTheDocument();
    editor.destroy();
  });
});
