// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { Paragraph } from "../Paragraph/block";
import { Divider } from "./block";

function makeEditor(content?: object) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, Divider],
    content: content as never,
  });
}

describe("Divider block — schema shape", () => {
  it("registers as group:'block', leaf, non-defining atom", () => {
    const editor = makeEditor();
    const t = editor.schema.nodes.divider;
    expect(t).toBeDefined();
    expect(t!.spec.group).toBe("block");
    expect(t!.spec.defining).toBe(false);
    expect(t!.isAtom).toBe(true);
    expect(t!.isLeaf).toBe(true);
    editor.destroy();
  });

  it("declares id + depth attrs from the factory", () => {
    const editor = makeEditor();
    const attrs = editor.schema.nodes.divider!.spec.attrs!;
    expect(attrs).toHaveProperty("id");
    expect(attrs).toHaveProperty("depth");
    editor.destroy();
  });
});

describe("Divider block — DOM I/O", () => {
  it("renderDOM emits <div class='rune-block'><hr></div>", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "divider" }],
    });
    const outer = editor.view.dom.querySelector<HTMLElement>(".rune-block");
    expect(outer).not.toBeNull();
    expect(outer!.tagName).toBe("DIV");
    expect(outer!.firstElementChild!.tagName).toBe("HR");
    editor.destroy();
  });

  it("parseDOM accepts <hr> from setContent HTML", () => {
    const editor = makeEditor();
    editor.commands.setContent("<p>before</p><hr><p>after</p>");
    const types: string[] = [];
    editor.state.doc.forEach((n) => types.push(n.type.name));
    expect(types).toEqual(["paragraph", "divider", "paragraph"]);
    editor.destroy();
  });

  it("clipboardRenderDOM emits bare ['hr'] (no wrapper)", () => {
    const editor = makeEditor();
    const meta = editor.extensionManager.extensions.find((e) => e.name === "divider")
      ?.storage as { clipboardRenderDOM?: (a: { node: unknown }) => unknown };
    expect(typeof meta?.clipboardRenderDOM).toBe("function");
    const node = editor.schema.nodes.divider!.create();
    const out = meta!.clipboardRenderDOM!({ node });
    expect(out).toEqual(["hr"]);
    editor.destroy();
  });
});

describe("Divider block — slash menu", () => {
  it("exposes slashMenuItems() returning a single 'divider' item in 'Basic blocks'", () => {
    const editor = makeEditor();
    const fn = (editor.extensionManager.extensions.find((e) => e.name === "divider")!
      .storage as {
      slashMenuItems?: (e: typeof editor) => Array<{
        key: string;
        title: string;
        aliases?: string[];
        group?: string;
      }>;
    }).slashMenuItems;
    expect(typeof fn).toBe("function");
    const items = fn!(editor);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.key).toBe("divider");
    expect(item.title).toBe("Divider");
    expect(item.aliases).toEqual(["hr", "horizontal rule", "line", "---"]);
    expect(item.group).toBe("Basic blocks");
    editor.destroy();
  });

  it("declares draggable side-menu", () => {
    const editor = makeEditor();
    const sideMenu = (editor.extensionManager.extensions.find((e) => e.name === "divider")!
      .storage as { sideMenu?: { draggable: boolean } }).sideMenu;
    expect(sideMenu).toEqual({ draggable: true });
    editor.destroy();
  });
});
