// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import {
  Paragraph,
  Heading,
  Divider,
  Image,
  TaskList,
  Equation,
  EquationBlockCommands,
  ColumnLayout,
} from "@ocai/rune-core";
import { getDefaultReactSlashMenuItems } from "./getDefaultReactSlashMenuItems";
import {
  TextIcon,
  DividerIcon,
  TeXIcon,
  ImageBlockIcon,
  ColumnsIcon,
  Columns3Icon,
  Columns4Icon,
  Columns5Icon,
} from "@/icons";

describe("getDefaultReactSlashMenuItems", () => {
  it("returns items decorated with icons keyed by DefaultSuggestionItem.key", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Heading, Divider, Text],
    });
    const items = getDefaultReactSlashMenuItems(editor);
    const paragraph = items.find((i) => i.title === "Paragraph")!;
    const divider = items.find((i) => i.title === "Divider")!;
    expect(paragraph).toBeDefined();
    expect((paragraph.icon as React.ReactElement).type).toBe(TextIcon);
    expect(divider).toBeDefined();
    expect((divider.icon as React.ReactElement).type).toBe(DividerIcon);
    editor.destroy();
  });

  it("preserves the `key` field on each item (used by frequency tracking)", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Heading, Text],
    });
    const items = getDefaultReactSlashMenuItems(editor);
    for (const item of items) {
      expect(typeof item.key).toBe("string");
      expect(item.key.length).toBeGreaterThan(0);
    }
    editor.destroy();
  });

  it("provides a Block Equation item with a custom TeX icon", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Text, Equation, EquationBlockCommands],
    });
    const items = getDefaultReactSlashMenuItems(editor);
    const equation = items.find((i) => i.key === "blockEquation")!;
    expect(equation).toBeDefined();
    expect(equation.title).toBe("Block Equation");
    expect((equation.icon as React.ReactElement).type).toBe(TeXIcon);
    editor.destroy();
  });

  it("provides an icon for image and keeps it slash-only", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Image, Text],
    });
    const items = getDefaultReactSlashMenuItems(editor);
    const image = items.find((i) => i.key === "image")!;

    expect(image).toBeDefined();
    expect(image.title).toBe("Image");
    expect((image.icon as React.ReactElement).type).toBe(ImageBlockIcon);
    expect(image.block).toBeUndefined();
    editor.destroy();
  });

  it("provides an icon for every columns item (2..5)", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Text, ColumnLayout],
    });
    const items = getDefaultReactSlashMenuItems(editor);
    const expectedIcons: Record<number, React.ComponentType> = {
      2: ColumnsIcon,
      3: Columns3Icon,
      4: Columns4Icon,
      5: Columns5Icon,
    };
    for (const count of [2, 3, 4, 5]) {
      const columns = items.find((i) => i.key === `columns_${count}`)!;
      expect(columns).toBeDefined();
      expect(columns.title).toBe(`${count} columns`);
      expect((columns.icon as React.ReactElement).type).toBe(expectedIcons[count]);
    }
    editor.destroy();
  });

  it("does not surface the task-list [] alias as a UI shortcut", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, TaskList, Text],
    });
    const items = getDefaultReactSlashMenuItems(editor);
    const taskList = items.find((i) => i.key === "taskList")!;

    expect(taskList.aliases).toContain("[]");
    expect(taskList.shortcut).toBeUndefined();
    editor.destroy();
  });
});
