// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ocean AI, LLC
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Editor, Node } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { describe, expect, it, vi } from "vitest"

import { Paragraph } from "../Paragraph/block"
import { Divider } from "./block"

const TestAtom = Node.create({
  name: "test-atom",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: "div[data-test-atom]" }],
  renderHTML: () => ["div", { "data-test-atom": "true" }],
})

function makeEditor(content = [
  { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
  { type: "divider" },
  { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
]) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, Divider],
    content: {
      type: "doc",
      content,
    } as never,
  })
  editor.view.dom.style.width = "200px"
  document.body.appendChild(editor.view.dom)
  return editor
}

function pressKey(
  editor: Editor,
  key:
    | "ArrowUp"
    | "ArrowDown"
    | "ArrowLeft"
    | "ArrowRight"
    | "Backspace"
    | "Delete",
): boolean {
  const ext = editor.extensionManager.extensions.find(
    (e) => e.name === "divider--keyboard",
  )
  if (!ext) throw new Error("divider--keyboard extension not registered")

  const shortcuts = (
    ext.config.addKeyboardShortcuts as (this: {
      editor: Editor
      options: unknown
      storage: unknown
      name: string
      parent: unknown
    }) => Record<string, (ctx: { editor: Editor }) => boolean>
  ).call({
    editor,
    options: ext.options,
    storage: ext.storage,
    name: ext.name,
    parent: undefined,
  })

  const handler = shortcuts[key]
  if (!handler) return false
  return handler({ editor })
}

function childTypes(editor: Editor): string[] {
  const types: string[] = []
  editor.state.doc.forEach((node) => types.push(node.type.name))
  return types
}

describe("Divider keyboard - Q4 vertical skip", () => {
  it("ArrowDown from the line above a divider lands in the line below", () => {
    const editor = makeEditor()
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowDown")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("bravo")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowUp from the line below a divider lands in the line above", () => {
    const editor = makeEditor()
    try {
      const bravoStart = 9
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowUp")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("alpha")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowDown skips multiple dividers and lands in the following paragraph", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowDown")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("bravo")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowDown with only trailing dividers consumes and leaves selection unchanged", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      const before = editor.state.selection.from
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowDown")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowUp skips multiple dividers and lands in the preceding paragraph", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = 10
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowUp")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("alpha")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowUp with only leading dividers consumes and leaves selection unchanged", () => {
    const editor = makeEditor([
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = 3
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )
      const before = editor.state.selection.from
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowUp")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("returns false and does not move when not at the visual textblock edge", () => {
    const editor = makeEditor()
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      const before = editor.state.selection.from
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(false)

      expect(pressKey(editor, "ArrowDown")).toBe(false)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })
})

describe("Divider keyboard - Q4 horizontal skip", () => {
  it("ArrowLeft at the start of the block after a divider lands at the end of the block before", () => {
    const editor = makeEditor()
    try {
      const bravoStart = 9
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )

      expect(pressKey(editor, "ArrowLeft")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(6)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("alpha")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowRight at the end of the block before a divider lands at the start of the block after", () => {
    const editor = makeEditor()
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )

      expect(pressKey(editor, "ArrowRight")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(9)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("bravo")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowLeft skips multiple dividers and lands in the preceding paragraph", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = 10
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )

      expect(pressKey(editor, "ArrowLeft")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(6)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("alpha")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowLeft with only leading dividers consumes and leaves selection unchanged", () => {
    const editor = makeEditor([
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = 3
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )
      const before = editor.state.selection.from

      expect(pressKey(editor, "ArrowLeft")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowRight skips multiple dividers and lands in the following paragraph", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )

      expect(pressKey(editor, "ArrowRight")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(10)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("bravo")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowRight with only trailing dividers consumes and leaves selection unchanged", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      const before = editor.state.selection.from

      expect(pressKey(editor, "ArrowRight")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowLeft returns false and does not move when not at the textblock start", () => {
    const editor = makeEditor()
    try {
      const insideBravo = 11
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, insideBravo),
        ),
      )
      const before = editor.state.selection.from

      expect(pressKey(editor, "ArrowLeft")).toBe(false)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowRight returns false and does not move when not at the textblock end", () => {
    const editor = makeEditor()
    try {
      const insideAlpha = 3
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, insideAlpha),
        ),
      )
      const before = editor.state.selection.from

      expect(pressKey(editor, "ArrowRight")).toBe(false)

      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(before)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })
})

describe("Divider keyboard - Q5 preserve on Backspace/Delete", () => {
  it("Backspace at the start of the block after a divider lands at the end of the block before", () => {
    const editor = makeEditor()
    try {
      const bravoStart = 9
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )

      expect(pressKey(editor, "Backspace")).toBe(true)

      expect(childTypes(editor)).toEqual(["paragraph", "divider", "paragraph"])
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(6)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("alpha")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Delete at the end of the block before a divider lands at the start of the block after", () => {
    const editor = makeEditor()
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )

      expect(pressKey(editor, "Delete")).toBe(true)

      expect(childTypes(editor)).toEqual(["paragraph", "divider", "paragraph"])
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(9)
      const $from = editor.state.doc.resolve(editor.state.selection.from)
      expect($from.parent.type.name).toBe("paragraph")
      expect($from.parent.textContent).toBe("bravo")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Backspace mid-paragraph returns false and leaves the document unchanged", () => {
    const editor = makeEditor()
    try {
      const before = editor.state.doc.toJSON()
      const insideBravo = 11
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, insideBravo),
        ),
      )

      expect(pressKey(editor, "Backspace")).toBe(false)

      expect(editor.state.doc.toJSON()).toEqual(before)
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(insideBravo)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Delete mid-paragraph returns false and leaves the document unchanged", () => {
    const editor = makeEditor()
    try {
      const before = editor.state.doc.toJSON()
      const insideAlpha = 3
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, insideAlpha),
        ),
      )

      expect(pressKey(editor, "Delete")).toBe(false)

      expect(editor.state.doc.toJSON()).toEqual(before)
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(insideAlpha)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Backspace at textblock start without an adjacent divider returns false", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const before = editor.state.doc.toJSON()
      const bravoStart = 8
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )

      expect(pressKey(editor, "Backspace")).toBe(false)

      expect(editor.state.doc.toJSON()).toEqual(before)
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(bravoStart)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Delete at textblock end without an adjacent divider returns false", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const before = editor.state.doc.toJSON()
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )

      expect(pressKey(editor, "Delete")).toBe(false)

      expect(editor.state.doc.toJSON()).toEqual(before)
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(6)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Backspace with only leading dividers consumes and leaves the document unchanged", () => {
    const editor = makeEditor([
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = 3
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )
      const beforeDoc = editor.state.doc.toJSON()
      const beforeSelection = editor.state.selection.from

      expect(pressKey(editor, "Backspace")).toBe(true)

      expect(editor.state.doc.toJSON()).toEqual(beforeDoc)
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(beforeSelection)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Delete with only trailing dividers consumes and leaves the document unchanged", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      const beforeDoc = editor.state.doc.toJSON()
      const beforeSelection = editor.state.selection.from

      expect(pressKey(editor, "Delete")).toBe(true)

      expect(editor.state.doc.toJSON()).toEqual(beforeDoc)
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(beforeSelection)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Backspace skips multiple dividers and preserves the divider run", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = 10
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )

      expect(pressKey(editor, "Backspace")).toBe(true)

      expect(childTypes(editor)).toEqual([
        "paragraph",
        "divider",
        "divider",
        "paragraph",
      ])
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(6)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Delete skips multiple dividers and preserves the divider run", () => {
    const editor = makeEditor([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )

      expect(pressKey(editor, "Delete")).toBe(true)

      expect(childTypes(editor)).toEqual([
        "paragraph",
        "divider",
        "divider",
        "paragraph",
      ])
      expect(editor.state.selection instanceof NodeSelection).toBe(false)
      expect(editor.state.selection.from).toBe(10)
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })
})

describe("Divider keyboard - #130: non-textblock target after divider run", () => {
  function makeEditorWithAtom(content: unknown) {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [Document, Paragraph, Text, Divider, TestAtom],
      content: { type: "doc", content } as never,
    })
    editor.view.dom.style.width = "200px"
    document.body.appendChild(editor.view.dom)
    return editor
  }

  it("ArrowDown across divider into a non-textblock lands as a NodeSelection on it", () => {
    const editor = makeEditorWithAtom([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "test-atom" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowDown")).toBe(true)

      // The atom sits at index 2; its boundary position is past the
      // paragraph (7) + divider (2) = 9. Resolving 9.nodeAfter is the
      // test-atom, and Selection.near forward yields a NodeSelection on it.
      expect(editor.state.selection instanceof NodeSelection).toBe(true)
      expect(editor.state.doc.nodeAt(editor.state.selection.from)?.type.name).toBe("test-atom")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("ArrowUp across divider into a non-textblock lands as a NodeSelection on it", () => {
    const editor = makeEditorWithAtom([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "test-atom" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = editor.state.doc.content.size - "bravo".length - 1
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )
      vi.spyOn(editor.view, "endOfTextblock").mockReturnValue(true)

      expect(pressKey(editor, "ArrowUp")).toBe(true)

      expect(editor.state.selection instanceof NodeSelection).toBe(true)
      expect(editor.state.doc.nodeAt(editor.state.selection.from)?.type.name).toBe("test-atom")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Backspace at start of paragraph after divider+atom run lands on the atom", () => {
    const editor = makeEditorWithAtom([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "test-atom" },
      { type: "divider" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      const bravoStart = editor.state.doc.content.size - "bravo".length - 1
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, bravoStart),
        ),
      )

      expect(pressKey(editor, "Backspace")).toBe(true)
      expect(editor.state.selection instanceof NodeSelection).toBe(true)
      expect(editor.state.doc.nodeAt(editor.state.selection.from)?.type.name).toBe("test-atom")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })

  it("Delete at end of paragraph before divider+atom run lands on the atom", () => {
    const editor = makeEditorWithAtom([
      { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
      { type: "divider" },
      { type: "test-atom" },
      { type: "paragraph", content: [{ type: "text", text: "bravo" }] },
    ])
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)),
      )

      expect(pressKey(editor, "Delete")).toBe(true)
      expect(editor.state.selection instanceof NodeSelection).toBe(true)
      expect(editor.state.doc.nodeAt(editor.state.selection.from)?.type.name).toBe("test-atom")
    } finally {
      const { dom } = editor.view
      editor.destroy()
      dom.remove()
    }
  })
})
