// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import Paragraph from "@tiptap/extension-paragraph";
import { SuggestionMenus, getSuggestionMenus } from "@ocai/rune-core";
import { ComponentsContext, defaultComponents } from "../ComponentsContext";
import { RuneEmojiPicker } from "./RuneEmojiPicker";

// A tiny stand-in for Emojibase `data.json` — searchEmojis fetches the corpus
// at runtime; jsdom has no network, so we stub fetch with a handful of
// entries the assertions below key on.
const CORPUS = [
  { label: "grinning face", emoji: "😀", tags: ["grin", "smile"], group: 0 },
  { label: "grinning face with big eyes", emoji: "😃", tags: ["grin"], group: 0 },
  { label: "fire", emoji: "🔥", tags: ["flame", "lit"], group: 0 },
  { label: "light skin tone", emoji: "🏻", tags: [], group: 2 }, // component → filtered
];

// 120 entries that all match the query "x" — exercises the no-cap path.
const BIG_CORPUS = Array.from({ length: 120 }, (_, i) => ({
  label: `xenon ${i}`,
  emoji: "🟦",
  tags: ["x"],
  group: 0,
}));

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      Document,
      Paragraph,
      Text,
      SuggestionMenus.configure({ triggers: [{ char: ":" }] }),
    ],
  });
}

function openTrigger(editor: Editor, query: string, range: { from: number; to: number }) {
  act(() => {
    getSuggestionMenus(editor).triggers[":"]!._setState({
      show: true,
      query,
      range,
      getClientRect: () => new DOMRect(0, 0, 0, 16),
    });
  });
}

function pressKey(editor: Editor, key: string): boolean {
  let consumed = false;
  act(() => {
    consumed =
      getSuggestionMenus(editor).triggers[":"]!.keyHandler.current?.(
        new KeyboardEvent("keydown", { key }),
      ) ?? false;
  });
  return consumed;
}

describe("RuneEmojiPicker", () => {
  beforeEach(() => {
    // URL-aware so each test gets its own corpus / failure on a distinct
    // base URL (loadEmojiIndex caches per base — a shared URL would leak
    // corpora across tests).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("broken")) return { ok: false, status: 500, json: async () => [] };
        if (u.includes("big")) return { ok: true, json: async () => BIG_CORPUS };
        return { ok: true, json: async () => CORPUS };
      }) as unknown as typeof fetch,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a grid of ranked matches and drops component-group entries", async () => {
    const editor = makeEditor();
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneEmojiPicker editor={editor} />
      </ComponentsContext.Provider>,
    );
    openTrigger(editor, "grin", { from: 1, to: 6 });

    // Two grinning matches render as grid options; the skin-tone component
    // never surfaces.
    expect(await screen.findByRole("option", { name: "grinning face" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "grinning face with big eyes" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "light skin tone" })).not.toBeInTheDocument();
    editor.destroy();
  });

  it("moves the highlight with arrow keys (2D grid nav)", async () => {
    const editor = makeEditor();
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneEmojiPicker editor={editor} />
      </ComponentsContext.Provider>,
    );
    openTrigger(editor, "grin", { from: 1, to: 6 });
    await screen.findByRole("option", { name: "grinning face" });

    // Index 0 highlighted by default → name strip shows the first match.
    const selectedAt = () =>
      screen.getByRole("option", { selected: true }).getAttribute("aria-label");
    expect(selectedAt()).toBe("grinning face");

    expect(pressKey(editor, "ArrowRight")).toBe(true);
    expect(selectedAt()).toBe("grinning face with big eyes");

    expect(pressKey(editor, "ArrowLeft")).toBe(true);
    expect(selectedAt()).toBe("grinning face");
    editor.destroy();
  });

  it("wires the keyboard handler so Enter commits the highlighted emoji", async () => {
    const editor = makeEditor();
    // Seed the doc with the typed trigger text so the committed range is real.
    editor.commands.setContent("<p>:fire</p>");
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneEmojiPicker editor={editor} />
      </ComponentsContext.Provider>,
    );
    // ":fire" occupies positions 1..6; the trigger range is the whole token.
    openTrigger(editor, "fire", { from: 1, to: 6 });
    await screen.findByRole("option", { name: "fire" });

    // The bug: this handler used to stay null, so Enter fell through to the
    // browser instead of selecting. It must now be wired.
    expect(getSuggestionMenus(editor).triggers[":"]!.keyHandler.current).toBeTypeOf(
      "function",
    );

    // Enter is consumed (prevented from reaching PM) and the highlighted
    // emoji replaces the `:fire` token.
    expect(pressKey(editor, "Enter")).toBe(true);
    expect(editor.getText()).toBe("🔥");
    editor.destroy();
  });

  it("renders ALL matches with no cap (scrollable)", async () => {
    const editor = makeEditor();
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneEmojiPicker editor={editor} emojibaseUrl="http://big.test/emojibase" />
      </ComponentsContext.Provider>,
    );
    openTrigger(editor, "x", { from: 1, to: 3 });
    // All 120 matches render — the picker no longer truncates the result set.
    await screen.findByRole("option", { name: "xenon 0" });
    expect(screen.getAllByRole("option")).toHaveLength(120);
    editor.destroy();
  });

  it("shows a retryable error state when the corpus fails to load", async () => {
    const editor = makeEditor();
    const renderError = vi.fn(() => <div>custom-error</div>);
    render(
      <ComponentsContext.Provider value={defaultComponents}>
        <RuneEmojiPicker
          editor={editor}
          emojibaseUrl="http://broken.test/emojibase"
          renderError={renderError}
        />
      </ComponentsContext.Provider>,
    );
    openTrigger(editor, "grin", { from: 1, to: 6 });

    // The custom renderError contract is honored (the prop the downstream
    // title "Add icon" surface relies on stays supported).
    expect(await screen.findByText("custom-error")).toBeInTheDocument();
    expect(renderError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), retry: expect.any(Function) }),
    );
    editor.destroy();
  });
});
