// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { Heading } from "./block";
import { BlockBackgroundColor, BlockTextColor } from "../../extensions/color";

describe("Heading block", () => {
  it("contributes four slash items — heading_1, heading_2, heading_3, heading_4", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Heading, Text],
    });
    const fn = (editor.extensionManager.extensions.find((e) => e.name === "heading")!
      .storage as { slashMenuItems?: unknown }).slashMenuItems;
    const items = (fn as Function)(editor);
    expect(items.map((i: { key: string }) => i.key)).toEqual([
      "heading_1",
      "heading_2",
      "heading_3",
      "heading_4",
    ]);
    editor.destroy();
  });

  it("renderDOM produces .rune-block > .rune-block-content > <hN> for each level (UI H1/H2/H3/H4 → h2/h3/h4/h5)", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Heading, Text],
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "h2 text" }] },
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "h3 text" }] },
          { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "h4 text" }] },
          { type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: "h5 text" }] },
        ],
      } as never,
    });

    const outers = editor.view.dom.querySelectorAll<HTMLElement>(".rune-block");
    expect(outers).toHaveLength(4);

    const tags = Array.from(outers).map((o) => {
      const inner = o.firstElementChild as HTMLElement;
      expect(inner.classList.contains("rune-block-content")).toBe(true);
      return (inner.firstElementChild as HTMLElement).tagName;
    });
    expect(tags).toEqual(["H2", "H3", "H4", "H5"]);

    editor.destroy();
  });

  it("registers heading--extras with Mod-Alt-1/2/3/4 shortcuts mapped to internal levels 2/3/4/5", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Heading, Text],
    });

    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "heading--extras",
    );
    expect(ext).toBeDefined();

    // The compiled child extension's addKeyboardShortcuts returns the chords.
    const shortcuts = (ext as any).config.addKeyboardShortcuts.call({
      editor,
      type: ext,
      options: {},
    });
    expect(Object.keys(shortcuts).sort()).toEqual([
      "Mod-Alt-1",
      "Mod-Alt-2",
      "Mod-Alt-3",
      "Mod-Alt-4",
    ]);

    editor.commands.setContent("<p>x</p>");
    editor.commands.setTextSelection(2);

    shortcuts["Mod-Alt-1"]({ editor });
    expect(editor.state.doc.firstChild?.type.name).toBe("heading");
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2);

    shortcuts["Mod-Alt-2"]({ editor });
    expect(editor.state.doc.firstChild?.attrs.level).toBe(3);

    shortcuts["Mod-Alt-3"]({ editor });
    expect(editor.state.doc.firstChild?.attrs.level).toBe(4);

    shortcuts["Mod-Alt-4"]({ editor });
    expect(editor.state.doc.firstChild?.attrs.level).toBe(5);

    editor.destroy();
  });

  it("places block-color attrs on .rune-block-content for every heading level", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Heading, Text, BlockBackgroundColor, BlockTextColor],
    })

    for (const [tag, level] of [["h2", 2], ["h3", 3], ["h4", 4], ["h5", 5]] as const) {
      editor.commands.setContent(`<${tag}>x</${tag}>`)
      editor.commands.setBlockBackgroundColor(0, "blue")
      const html = editor.getHTML()
      expect(html).toMatch(
        new RegExp(
          `<div[^>]*class="rune-block-content"[^>]*data-background-color="blue"[^>]*><${tag}>x</${tag}>`,
        ),
      )
      expect(html).not.toMatch(
        /<div[^>]*class="rune-block"[^>]*data-background-color/,
      )
      void level // exercised via setContent tag only — level is intrinsic to <h${n}>
    }
    editor.destroy()
  })

  it("registers four Markdown input rules — # / ## / ### / #### — mapped to internal levels 2/3/4/5", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Heading, Text],
    });

    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "heading--extras",
    );
    expect(ext).toBeDefined();

    // The compiled child extension's addInputRules returns InputRule[].
    // Tiptap v3's InputRule class exposes the RegExp as `.find` (NOT `.match`
    // — `match` is the per-handler ExtendedRegExpMatchArray, a different
    // thing). See node_modules/@tiptap/core/dist/index.d.ts:45.
    const rules = (ext as any).config.addInputRules.call({
      editor,
      type: ext,
      options: {},
    });
    const sources = rules.map((r: { find: RegExp }) => r.find.source);
    // Order isn't part of the contract — presence is. Use Set comparison.
    expect(rules).toHaveLength(4);
    expect(new Set(sources)).toEqual(
      new Set(["^#\\s$", "^##\\s$", "^###\\s$", "^####\\s$"]),
    );

    editor.destroy();
  });
});

describe("Heading — clipboardRenderDOM", () => {
  it.each([2, 3, 4, 5] as const)("emits bare <h%i> for level %i", (level) => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Heading, Text],
    });
    const meta = editor.extensionManager.extensions.find((e) => e.name === "heading")
      ?.storage as { clipboardRenderDOM?: (a: { node: any }) => unknown };
    expect(typeof meta?.clipboardRenderDOM).toBe("function");
    const node = editor.schema.nodes.heading!.create({ level });
    const out = meta!.clipboardRenderDOM!({ node });
    expect(out).toEqual([`h${level}`, {}, 0]);
    editor.destroy();
  });
});
